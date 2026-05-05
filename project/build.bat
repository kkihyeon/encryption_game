@echo off
chcp 65001 > nul
echo.
echo ============================================================
echo   암호화 대전 게임 - PyInstaller 빌드
echo ============================================================
echo.

:: PyInstaller 설치 확인
where pyinstaller >nul 2>&1
if errorlevel 1 (
    echo  [오류] PyInstaller 가 설치되어 있지 않습니다.
    echo         아래 명령으로 설치 후 다시 실행하세요:
    echo.
    echo           pip install pyinstaller
    echo.
    pause
    exit /b 1
)

:: 필수 파일 존재 확인
if not exist "server.py"  ( echo  [오류] server.py 를 찾을 수 없습니다. & pause & exit /b 1 )
if not exist "src.html"   ( echo  [오류] src.html  를 찾을 수 없습니다. & pause & exit /b 1 )
if not exist "src.css"    ( echo  [오류] src.css   를 찾을 수 없습니다. & pause & exit /b 1 )
if not exist "js"         ( echo  [오류] js/ 폴더  를 찾을 수 없습니다. & pause & exit /b 1 )

echo   빌드 중 (잠시 기다려 주세요)...
echo.

:: 이전 빌드 캐시 정리
if exist "build" rmdir /s /q "build"
if exist "dist"  rmdir /s /q "dist"

pyinstaller ^
    --onefile ^
    --console ^
    --name "암호대전게임" ^
    --add-data "src.html;." ^
    --add-data "src.css;." ^
    --add-data "js;js" ^
    server.py

if errorlevel 1 (
    echo.
    echo  [실패] 빌드 중 오류가 발생했습니다.
    pause
    exit /b 1
)

:: 빌드 중간 산물 정리 (dist\ 만 남김)
if exist "build"          rmdir /s /q "build"
if exist "암호대전게임.spec" del /q "암호대전게임.spec"

echo.
echo ============================================================
echo   완료!  dist\암호대전게임.exe
echo ============================================================
echo.
pause
