$ErrorActionPreference = "Stop"
if (-not $IsWindows -or $env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
  throw "Kokoro preparation requires Windows x64."
}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$stage = Join-Path $root "runtime/kokoro/downloads/windows-ci"
$pythonDir = Join-Path $stage "python"
$packages = Join-Path $pythonDir "Lib/site-packages"
New-Item -ItemType Directory -Force $packages | Out-Null

function Download-Checked($url, $destination, $sha256) {
  & curl.exe --fail --location --retry 3 --connect-timeout 30 --max-time 600 --header "Accept: application/octet-stream" --user-agent "ResourcesManager-CI" $url --output $destination
  if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
  if ((Get-FileHash $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256) {
    throw "SHA256 mismatch: $destination"
  }
}

$pythonArchive = Join-Path $stage "python.zip"
Download-Checked "https://www.python.org/ftp/python/3.13.7/python-3.13.7-embed-amd64.zip" $pythonArchive "f6cca216a359be84797cabb54149ce5e062afb16cc7567eb7fc51cacb2d86b65"
Expand-Archive -Path $pythonArchive -DestinationPath $pythonDir -Force
& python -m pip install --disable-pip-version-check --only-binary=:all: --no-compile --target $packages -r runtime/kokoro/requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Windows Python dependency installation failed." }
# NumPy's official wheel includes the MSVC runtime needed by sherpa-onnx.
$msvc = Get-ChildItem (Join-Path $packages "numpy.libs") -Filter "msvcp140-*.dll" | Select-Object -First 1
if (-not $msvc) { throw "Missing Microsoft C++ runtime in NumPy wheel." }
Copy-Item $msvc.FullName (Join-Path $pythonDir "msvcp140.dll")

$modelArchive = Join-Path $stage "model.tar.bz2"
Download-Checked "https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/assets/265069793?download=1" $modelArchive "a1e94694776049035c4f2c6529f003aaece993c76aae9a78995831c3c4dcafc6"
& tar -xf $modelArchive -C $stage
if ($LASTEXITCODE -ne 0) { throw "Model extraction failed." }
Move-Item (Join-Path $stage "kokoro-int8-multi-lang-v1_1") (Join-Path $stage "model")
& node scripts/prepare-kokoro.mjs --from $stage --windows
if ($LASTEXITCODE -ne 0) { throw "Kokoro manifest preparation failed." }
& runtime/kokoro/bundle/win32-x64/python/python.exe -c "import sherpa_onnx,numpy,opencc; print('Embedded Python imports OK')"
if ($LASTEXITCODE -ne 0) { throw "Embedded Windows Python cannot load Kokoro dependencies." }
