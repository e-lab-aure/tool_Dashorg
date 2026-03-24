@echo off
title Dashorg - Serveur de developpement
color 0A

:: Recupere l'IP reseau (exclut le loopback 127.x.x.x)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set RAW_IP=%%a
)

:: Supprime l'espace en debut de chaine
set LOCAL_IP=%RAW_IP: =%

echo ============================================
echo   Dashorg - Serveur de developpement
echo ============================================
echo.
echo   Adresse reseau : http://%LOCAL_IP%:3000
echo   Adresse locale : http://localhost:3000
echo.
echo ============================================
echo.

:: Lance le serveur Next.js en mode developpement
npm run dev

:: Maintient la fenetre ouverte si le serveur s'arrete de facon inattendue
echo.
echo ============================================
echo   Le serveur s'est arrete.
echo ============================================
pause
