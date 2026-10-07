@echo off
REM SpendWise - start all backend microservices (one window each) + React client
cd /d "%~dp0"
for %%s in (discovery auth category expense report gateway) do (
  start "spendwise-%%s" cmd /k "cd services\%%s && node server.js"
)
start "spendwise-client" cmd /k "cd client && npm.cmd run dev -- --host"
echo All SpendWise services starting. Open http://localhost:5173 in a minute.
pause
