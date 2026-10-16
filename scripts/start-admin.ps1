param([int]$Port = 5173)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendPath = Join-Path $projectRoot 'frontend'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $projectRoot '.tools/node-v22.14.0-win-x64/node.exe' }
$vitePath = Join-Path $frontendPath 'node_modules/vite/bin/vite.js'

if (-not (Test-Path -LiteralPath $nodePath)) {
    throw 'Node.js is missing. Install Node.js 22.12+ and run npm ci in frontend.'
}
if (-not (Test-Path -LiteralPath $vitePath)) {
    throw 'Frontend dependencies are missing. Run npm ci in frontend first.'
}

Write-Host "IC Group admin: http://localhost:$Port/admin"
Push-Location -LiteralPath $frontendPath
try {
    & $nodePath $vitePath --host 127.0.0.1 --port $Port --strictPort
    if ($LASTEXITCODE -ne 0) { throw "Vite exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
