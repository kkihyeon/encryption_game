#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
암호화 대전 게임 빌드 스크립트
────────────────────────────────
실행: python build.py
결과: dist/암호대전게임.exe
"""
import os
import sys
import shutil
import subprocess

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    print()
    print('=' * 50)
    print('  암호화 대전 게임 빌드')
    print('=' * 50)

    # 필수 파일 확인
    for f in ['server.py', 'src.html', 'src.css', 'js', '암호화대전게임배경.png']:
        if not os.path.exists(f):
            print(f'  [오류] {f} 를 찾을 수 없습니다.')
            input('  아무 키나 누르세요...')
            sys.exit(1)
    print('  필수 파일 확인 ✓')

    # 이전 빌드 산물 정리
    for d in ['build', 'dist']:
        if os.path.exists(d):
            shutil.rmtree(d)
            print(f'  이전 {d}/ 정리 ✓')

    # PyInstaller 실행
    # os.pathsep: Windows=';', macOS/Linux=':'
    sep = os.pathsep
    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--onefile',
        '--console',
        '--name', '암호대전게임',
        '--add-data', f'src.html{sep}.',
        '--add-data', f'src.css{sep}.',
        '--add-data', f'js{sep}js',
        '--add-data', f'암호화대전게임배경.png{sep}.',
        'server.py',
    ]

    print()
    print('  빌드 중... (1~2분 소요)')
    print()
    result = subprocess.run(cmd)

    # 중간 산물 정리
    for path in ['build', '암호대전게임.spec']:
        if os.path.isdir(path):
            shutil.rmtree(path)
        elif os.path.isfile(path):
            os.remove(path)

    print()
    if result.returncode != 0:
        print('=' * 50)
        print('  [실패] 빌드 중 오류가 발생했습니다.')
        print('  위 로그에서 원인을 확인하세요.')
        print('=' * 50)
        input('  아무 키나 누르세요...')
        sys.exit(1)

    print('=' * 50)
    print('  완료!  dist/암호대전게임.exe')
    print('=' * 50)
    input('  아무 키나 누르세요...')

if __name__ == '__main__':
    main()
