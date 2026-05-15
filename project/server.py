#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
암호화 대전 게임 - Python 래퍼
────────────────────────────────────────────────────
실행: python server.py [포트]   (기본값: 9000)

하나의 포트에서 네 가지를 동시에 처리합니다:
  1) HTTP  GET /          → src.html 서빙
  2) HTTP  GET /src.css, /js/*.js  → 정적 파일 서빙
  3) HTTP  GET /api/info  → LAN IP·포트 JSON 반환
  4) WebSocket            → 게임 플레이어 간 메시지 중계

표준 라이브러리만 사용 (pip install 불필요, Python 3.6+)
────────────────────────────────────────────────────
"""
import sys
sys.dont_write_bytecode = True

import os
import json
import socket
import struct
import hashlib
import base64
import threading
import uuid
import webbrowser
import time
from urllib.parse import parse_qs, urlparse, unquote

# ── 설정 ─────────────────────────────────────────
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9000

# WebSocket 수신 메시지 최대 크기 (과도한 메시지로 인한 메모리 소진 방지)
MAX_WS_MSG = 2 * 1024 * 1024  # 2 MB

def resource_path(filename):
    """
    --onefile 빌드 시 PyInstaller는 임시폴더(sys._MEIPASS)에 파일을 풀어놓음.
    일반 실행(python server.py) 시엔 스크립트 위치 기준으로 파일을 찾음.
    """
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, filename)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)

HTML_FILE = resource_path('src.html')

# 정적 파일 서빙 기준 디렉터리 (path traversal 방지에 사용)
BASE_DIR = os.path.realpath(
    sys._MEIPASS if hasattr(sys, '_MEIPASS')
    else os.path.dirname(os.path.abspath(__file__))
)

# 허용된 파일 확장자 → Content-Type 매핑
CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
}

# ── WebSocket 클라이언트 목록 ─────────────────────
_ws_clients = {}   # peer_id -> socket
_ws_lock    = threading.Lock()


# ════════════════════════════════════════════════
#  LAN IP 감지
# ════════════════════════════════════════════════
def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

LAN_IP = get_lan_ip()


# ════════════════════════════════════════════════
#  WebSocket 유틸
# ════════════════════════════════════════════════
WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

def ws_handshake(conn, headers):
    """HTTP → WebSocket 업그레이드 핸드셰이크"""
    key = headers.get('sec-websocket-key', '')
    accept = base64.b64encode(
        hashlib.sha1((key + WS_MAGIC).encode()).digest()
    ).decode()
    response = (
        'HTTP/1.1 101 Switching Protocols\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        f'Sec-WebSocket-Accept: {accept}\r\n\r\n'
    )
    conn.sendall(response.encode())

def ws_recv_frame(conn):
    """WebSocket 프레임 수신 → 텍스트 반환. 연결 종료면 None."""
    try:
        def recv_exact(n):
            buf = b''
            while len(buf) < n:
                chunk = conn.recv(n - len(buf))
                if not chunk:
                    return None
                buf += chunk
            return buf

        hdr = recv_exact(2)
        if hdr is None:
            return None

        b1, b2 = hdr[0], hdr[1]
        opcode = b1 & 0x0F

        if opcode == 8:   # close
            return None
        if opcode == 9:   # ping → pong
            conn.sendall(bytes([0x8A, 0x00]))
            return ''

        masked = bool(b2 & 0x80)
        length = b2 & 0x7F

        if length == 126:
            raw = recv_exact(2)
            if raw is None: return None
            length = struct.unpack('>H', raw)[0]
        elif length == 127:
            raw = recv_exact(8)
            if raw is None: return None
            length = struct.unpack('>Q', raw)[0]

        # 비정상적으로 큰 메시지 차단
        if length > MAX_WS_MSG:
            print(f'  [WS!] 메시지 크기 초과 ({length} bytes) — 연결 차단')
            return None

        mask_key = recv_exact(4) if masked else b'\x00\x00\x00\x00'
        if mask_key is None: return None

        data = recv_exact(length)
        if data is None: return None

        if masked:
            data = bytes(b ^ mask_key[i % 4] for i, b in enumerate(data))

        return data.decode('utf-8', errors='replace')

    except Exception:
        return None

def ws_send_frame(conn, msg):
    """텍스트 메시지를 WebSocket 프레임으로 전송"""
    try:
        data = msg.encode('utf-8')
        n = len(data)
        if n < 126:
            header = bytes([0x81, n])
        elif n < 65536:
            header = bytes([0x81, 126]) + struct.pack('>H', n)
        else:
            header = bytes([0x81, 127]) + struct.pack('>Q', n)
        conn.sendall(header + data)
        return True
    except Exception:
        return False

def ws_send_json(conn, obj):
    return ws_send_frame(conn, json.dumps(obj, ensure_ascii=False))


# ════════════════════════════════════════════════
#  WebSocket 클라이언트 처리
# ════════════════════════════════════════════════
def handle_ws_client(conn, addr, path):
    """WebSocket 연결 1개를 담당하는 스레드"""
    peer_id = None
    try:
        # peer_id 추출: ?id=XXX
        qs = parse_qs(urlparse(path).query)
        requested = (qs.get('id', [None])[0] or '').strip()
        if not requested or requested == '__random__':
            peer_id = 'py-' + uuid.uuid4().hex[:10]
        else:
            peer_id = requested

        # 중복 ID 체크
        with _ws_lock:
            if peer_id in _ws_clients:
                ws_send_json(conn, {
                    'type': 'error',
                    'errType': 'unavailable-id',
                    'message': f'{peer_id} is taken'
                })
                return
            _ws_clients[peer_id] = conn

        print(f'  [WS+] {peer_id}  ({addr[0]})  접속: {len(_ws_clients)}명')
        ws_send_json(conn, {'type': 'open', 'id': peer_id})

        # 메시지 루프
        while True:
            raw = ws_recv_frame(conn)
            if raw is None:
                break
            if not raw:
                continue

            try:
                msg  = json.loads(raw)
                dst  = msg.get('dst')
                mtype = msg.get('type')
                if not dst:
                    continue

                with _ws_lock:
                    dst_conn = _ws_clients.get(dst)

                if mtype == 'connect':
                    if dst_conn:
                        ws_send_json(dst_conn, {'type': 'connect',     'src': peer_id})
                        ws_send_json(conn,     {'type': 'connect-ack', 'src': dst})
                    else:
                        ws_send_json(conn, {
                            'type': 'error',
                            'errType': 'peer-unavailable',
                            'message': f'{dst} 에 연결할 수 없습니다'
                        })
                elif dst_conn:
                    ws_send_json(dst_conn, {**msg, 'src': peer_id})

            except Exception as e:
                print(f'  [WS!] 처리 오류: {e}')

    except Exception as e:
        print(f'  [WS!] {addr}: {e}')
    finally:
        if peer_id:
            with _ws_lock:
                _ws_clients.pop(peer_id, None)
            print(f'  [WS-] {peer_id}  접속: {len(_ws_clients)}명')
        try:
            conn.close()
        except Exception:
            pass


# ════════════════════════════════════════════════
#  HTTP 처리
# ════════════════════════════════════════════════
def parse_http_request(raw: bytes):
    """raw 바이트에서 method, path, headers 파싱"""
    try:
        header_part = raw.split(b'\r\n\r\n')[0].decode('utf-8', errors='replace')
        lines = header_part.split('\r\n')
        parts = lines[0].split(' ')
        method = parts[0] if len(parts) > 0 else 'GET'
        path   = parts[1] if len(parts) > 1 else '/'
        headers = {}
        for line in lines[1:]:
            if ':' in line:
                k, v = line.split(':', 1)
                headers[k.strip().lower()] = v.strip()
        return method, path, headers
    except Exception:
        return 'GET', '/', {}

def http_response(conn, status, content_type, body: bytes, extra_headers=''):
    header = (
        f'HTTP/1.1 {status}\r\n'
        f'Content-Type: {content_type}\r\n'
        f'Content-Length: {len(body)}\r\n'
        'Access-Control-Allow-Origin: *\r\n'
        'Connection: close\r\n'
        f'{extra_headers}'
        '\r\n'
    )
    try:
        conn.sendall(header.encode() + body)
    except Exception:
        pass

def serve_html(conn):
    """src.html 파일을 HTTP로 전송"""
    if not os.path.exists(HTML_FILE):
        body = '<h1>src.html not found</h1><p>server.py와 같은 폴더에 src.html을 놓아주세요.</p>'.encode('utf-8')
        http_response(conn, '404 Not Found', 'text/html; charset=utf-8', body)
        return
    with open(HTML_FILE, 'rb') as f:
        body = f.read()
    http_response(conn, '200 OK', 'text/html; charset=utf-8', body)

def serve_static(conn, clean_path):
    """
    CSS·JS·이미지 정적 파일 서빙.
    - BASE_DIR 외부 경로 차단 (path traversal 방지)
    - 허용 확장자만 서빙
    - URL 인코딩된 한글 파일명 디코딩 처리
    """
    rel = unquote(clean_path.lstrip('/'))
    target = os.path.realpath(os.path.join(BASE_DIR, rel))

    # BASE_DIR 밖 접근 차단
    if not target.startswith(BASE_DIR + os.sep):
        serve_not_found(conn)
        return

    _, ext = os.path.splitext(target)
    if ext.lower() not in CONTENT_TYPES:
        serve_not_found(conn)
        return

    if not os.path.isfile(target):
        serve_not_found(conn)
        return

    with open(target, 'rb') as f:
        body = f.read()
    http_response(conn, '200 OK', CONTENT_TYPES[ext.lower()], body)

def serve_api_info(conn):
    """GET /api/info → {ip, port} JSON"""
    body = json.dumps({'ip': LAN_IP, 'port': PORT}, ensure_ascii=False).encode('utf-8')
    http_response(conn, '200 OK', 'application/json; charset=utf-8', body)

def serve_not_found(conn):
    body = b'404 Not Found'
    http_response(conn, '404 Not Found', 'text/plain', body)


# ════════════════════════════════════════════════
#  연결 디스패처 (HTTP vs WebSocket 판별)
# ════════════════════════════════════════════════
def handle_connection(conn, addr):
    """
    새 TCP 연결을 받아 HTTP인지 WebSocket 업그레이드인지 판별 후 처리.
    모든 처리가 단일 포트(PORT)에서 이루어집니다.
    """
    try:
        # 헤더가 모두 도착할 때까지 읽기
        raw = b''
        conn.settimeout(10)
        while b'\r\n\r\n' not in raw:
            chunk = conn.recv(4096)
            if not chunk:
                return
            raw += chunk
        conn.settimeout(None)

        method, path, headers = parse_http_request(raw)
        upgrade = headers.get('upgrade', '').lower()

        # ── WebSocket 업그레이드 요청 ──
        if upgrade == 'websocket':
            ws_handshake(conn, headers)
            handle_ws_client(conn, addr, path)
            return

        # ── 일반 HTTP 요청 ──
        clean_path = urlparse(path).path

        if clean_path.rstrip('/') in ('', '/'):
            serve_html(conn)
        elif clean_path == '/api/info':
            serve_api_info(conn)
        else:
            serve_static(conn, clean_path)

    except Exception:
        pass  # 연결 초기화 중 소켓 오류 (클라이언트 조기 종료 등)
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ════════════════════════════════════════════════
#  메인
# ════════════════════════════════════════════════
def main():
    # src.html 존재 여부 사전 확인
    html_exists = os.path.exists(HTML_FILE)

    print()
    print('=' * 50)
    print('  암호화 대전 게임 - 서버 시작')
    print('=' * 50)

    if not html_exists:
        print(f'  ⚠  src.html 을 찾을 수 없습니다.')
        print(f'     server.py 와 같은 폴더에 src.html 을 놓아주세요.')
        print(f'     경로: {HTML_FILE}')
        print('=' * 50)
    else:
        print(f'  게임 파일 : src.html ✓')

    print(f'  포트      : {PORT}')
    print(f'  내 IP     : {LAN_IP}')
    print()
    print(f'  ▶ 브라우저 주소 (내 PC):')
    print(f'     http://localhost:{PORT}')
    print()
    print(f'  ▶ 같은망 팀원 접속 주소:')
    print(f'     http://{LAN_IP}:{PORT}')
    print()
    print(f'  ※ 같은망 모드로 플레이하려면 네트워크 설정에서')
    print(f'     [같은망] 을 선택하고 호스트 IP를 입력하세요.')
    print('=' * 50)
    print('  종료하려면 Ctrl+C 를 누르세요.')
    print()

    # TCP 서버 소켓
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        srv.bind(('0.0.0.0', PORT))
    except OSError as e:
        print(f'  ✗ 포트 {PORT} 를 열 수 없습니다: {e}')
        print(f'    다른 프로그램이 해당 포트를 사용 중이거나,')
        print(f'    python server.py {PORT+1}  처럼 다른 포트를 지정해 보세요.')
        sys.exit(1)

    srv.listen(64)

    # 브라우저 자동 열기 (0.8초 뒤 — 서버가 준비될 시간 확보)
    def open_browser():
        time.sleep(0.8)
        try:
            webbrowser.open(f'http://localhost:{PORT}')
        except Exception:
            pass

    threading.Thread(target=open_browser, daemon=True).start()

    # 연결 수락 루프
    try:
        while True:
            conn, addr = srv.accept()
            t = threading.Thread(
                target=handle_connection,
                args=(conn, addr),
                daemon=True
            )
            t.start()
    except KeyboardInterrupt:
        print('\n  서버를 종료합니다.')
    finally:
        srv.close()


if __name__ == '__main__':
    main()
