param([Parameter(Mandatory=$true)][string]$KokoroSource)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if ((node -p 'process.platform') -ne 'win32' -or (node -p 'process.arch') -ne 'x64' -or (node --version) -notmatch '^v20\.') { throw 'Run on Windows x64 with Node 20 x64.' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
node scripts/prepare-kokoro.mjs --from $KokoroSource --windows
if ($LASTEXITCODE -ne 0) { throw 'Kokoro resource preparation failed' }
$python = '.\runtime\kokoro\bundle\win32-x64\python\python.exe'
& $python -c 'import onnxruntime,numpy,opencc; print(onnxruntime.__version__)'
if ($LASTEXITCODE -ne 0) { throw 'Python native dependency check failed' }
npm run test:profiles
if ($LASTEXITCODE -ne 0) { throw 'Profile tests failed' }
npm run test:novel
if ($LASTEXITCODE -ne 0) { throw 'Novel tests failed' }
npm run release:win
if ($LASTEXITCODE -ne 0) { throw 'Windows packaging failed' }
Write-Output 'Build complete. Still verify playback, seeking, volume, profile switching and process cleanup in the installed app.'
