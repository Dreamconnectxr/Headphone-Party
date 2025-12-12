param(
    [string]$Prompt = "a photorealistic robot painting a portrait",
    [string]$NegativePrompt = "",
    [int]$Frames = 4,
    [int]$Steps = 30,
    [double]$Guidance = 7.5,
    [int]$Seed = 42,
    [string]$ModelId = "runwayml/stable-diffusion-v1-5",
    [switch]$UseCPU,
    [switch]$ReuseLatents,
    [int]$SeedStride = 1,
    [string]$Scheduler = "dpm",
    [string]$Output = "",
    [switch]$MakeGif,
    [switch]$MakeVideo,
    [int]$Height,
    [int]$Width,
    [switch]$Offload,
    [switch]$DownloadOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $root ".venv/Scripts/python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Error "Virtual environment not found. Run ./setup.ps1 first."
    exit 1
}

$device = if ($UseCPU) { "cpu" } else { "cuda" }

$cmd = @(
    $venvPython,
    (Join-Path $root "examples/demo_stream.py"),
    "--prompt", $Prompt,
    "--frames", $Frames,
    "--steps", $Steps,
    "--guidance", $Guidance,
    "--seed", $Seed,
    "--model-id", $ModelId,
    "--device", $device,
    "--scheduler", $Scheduler
)

if ($NegativePrompt -ne "") { $cmd += @("--negative-prompt", $NegativePrompt) }
if ($ReuseLatents) { $cmd += "--reuse-latents" }
if ($SeedStride -ne 1) { $cmd += @("--seed-stride", $SeedStride) }
if ($Output -ne "") { $cmd += @("--output", $Output) }
if ($MakeGif) { $cmd += "--make-gif" }
if ($MakeVideo) { $cmd += "--make-video" }
if ($Height) { $cmd += @("--height", $Height) }
if ($Width) { $cmd += @("--width", $Width) }
if ($Offload) { $cmd += "--offload" }
if ($DownloadOnly) { $cmd += "--download-only" }

Write-Host "[run]" ($cmd -join " ")
& $cmd[0] $cmd[1..($cmd.Count - 1)]
