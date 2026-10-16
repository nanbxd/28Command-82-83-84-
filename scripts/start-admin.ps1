param([int]$Port = 5173)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendPath = Join-Path $projectRoot 'frontend'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$localNode = @('node-v22.23.3-win-x64', 'node-v22.14.0-win-x64') | ForEach-Object { Join-Path $projectRoot ".tools/$_/node.exe" } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$nodePath = if ($nodeCommand) { $nodeCommand.Source } elseif ($localNode) { $localNode } else { '' }
$vitePath = Join-Path $frontendPath 'node_modules/vite/bin/vite.js'

if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath)) {
    throw 'Node.js is missing. Install Node.js 22.12+ and run npm ci in frontend.'
}
if (-not (Test-Path -LiteralPath $vitePath)) {
    throw 'Frontend dependencies are missing. Run npm ci in frontend first.'
}

Write-Host "IC Group admin: http://localhost:$Port/admin"
Write-Host "IC Group demo (without backend): http://localhost:$Port/demo/admin"
Push-Location -LiteralPath $frontendPath
try {
    & $nodePath $vitePath --host 127.0.0.1 --port $Port --strictPort
    if ($LASTEXITCODE -ne 0) { throw "Vite exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
