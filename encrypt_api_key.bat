@echo off
title Creative Rarities - Key Encryptor
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File .\encrypt_api_key.ps1
