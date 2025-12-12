param(
    [switch]$UseCPU,
    [string]$TorchIndexUrl = "",
    [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPath = Join-Path $root ".venv"
$python = Join-Path $venvPath "Scripts/python.exe"

function Write-Step($message) {
    Write-Host "[setup] $message"
}

Write-Step "creating virtual environment at $venvPath"
& $PythonExe -m venv $venvPath

Write-Step "upgrading pip"
& $python -m pip install --upgrade pip

if ($UseCPU) {
    Write-Step "installing CPU-only PyTorch 2.1.2"
    & $python -m pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --index-url https://download.pytorch.org/whl/cpu
} else {
    $torchSource = if ($TorchIndexUrl -ne "") { $TorchIndexUrl } else { "https://download.pytorch.org/whl/cu121" }
    Write-Step "installing CUDA-enabled PyTorch 2.1.2 from $torchSource"
    & $python -m pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --extra-index-url $torchSource
}

Write-Step "installing pinned dependencies"
& $python -m pip install -r (Join-Path $root "requirements.txt")

Write-Step "done. Activate with:`n`t$venvPath\\Scripts\\Activate.ps1"
