# StreamDiffusion for Windows 11 (Self contained)

This folder contains a Windows-first, reproducible setup for trying Stream Diffusion style text-to-image streaming locally. Everything is pinned to specific versions and wrapped in PowerShell helpers so you can clone the repo, run one script, and then try the demos without hunting for dependencies.

## What you get
- Windows 11 friendly PowerShell automation to create a virtual environment and install pinned dependencies.
- Optional CUDA wheel installation for PyTorch (CPU-only is supported too).
- A tiny implementation of a streaming text-to-image loop built on top of Hugging Face Diffusers.
- Example script to render multiple frames as a simple “stream” and save them to disk (plus an optional video/gif).
- A Hugging Face Hub downloader so you can prefetch models before running demos.

## Prerequisites (Windows 11)
- Python 3.10 or 3.11 on PATH (64-bit). Python 3.12 is not recommended for PyTorch right now.
- Git for Windows.
- PowerShell 7+ (or Windows PowerShell with execution policy allowed for local scripts).
- For GPU acceleration: recent NVIDIA drivers and the matching CUDA-enabled PyTorch wheel (the script can pull the cu121 wheel for Ampere+ GPUs).
- (Optional) A Hugging Face token in the `HF_TOKEN` environment variable if you need gated models.

## Quickstart
1. Open **PowerShell** in the repository root and switch to this folder:
   ```pwsh
   cd streamdiffusion_windows
   ```
2. If PowerShell script execution is restricted, temporarily relax it for the session:
   ```pwsh
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```
3. Create the virtual environment and install dependencies. Add `-UseCPU` to avoid installing the CUDA wheel.
   ```pwsh
   # GPU-friendly (uses cu121 by default)
   ./setup.ps1
   
   # CPU-only
   ./setup.ps1 -UseCPU
   ```
4. (Optional) Pre-download the model weights (defaults to `runwayml/stable-diffusion-v1-5`) so the first run is offline:
   ```pwsh
   ./run_demo.ps1 -DownloadOnly
   ```
5. Run the demo stream generator:
   ```pwsh
   ./run_demo.ps1 -Prompt "a tiny robot painting at a desk" -Frames 6 -Steps 25
   ```
   Generated images land in `streamdiffusion_windows/outputs/<timestamp>` and a summary GIF/MP4 is created when `-MakeVideo` or `-MakeGif` is used.

## Files
- `setup.ps1` – builds `.venv`, installs PyTorch (CUDA or CPU) plus the pinned dependencies in `requirements.txt`.
- `run_demo.ps1` – convenience runner for the demo and a downloader-only mode.
- `requirements.txt` – non-PyTorch dependencies with locked versions.
- `examples/demo_stream.py` – Python example showing a simple streaming inference loop.
- `examples/demo_img2img.py` – tiny img2img sanity check using a CPU-friendly toy model.
- `streamdiffusion/pipeline.py` – lightweight StreamDiffusion-style helper that wraps the diffusers pipeline and yields frames.
- `scripts/download_models.py` – Hugging Face snapshot downloader for offline runs.

### Run the img2img sanity check (CPU friendly)
This uses a tiny diffusers checkpoint so you can quickly verify img2img works without downloading full Stable Diffusion weights:

```pwsh
python examples/demo_img2img.py --prompt "a watercolor landscape" --num-steps 4 --strength 0.75
```

Outputs land in `streamdiffusion_windows/outputs/img2img/<timestamp>` and include both the init image and the edited result.

### Pinned dependency versions
- PyTorch / torchvision / torchaudio: **2.1.2 / 0.16.2 / 2.1.2** (CUDA cu121 by default, CPU when `-UseCPU`)
- diffusers: **0.30.2**
- transformers: **4.41.2**
- accelerate: **0.32.1**
- pillow: **10.3.0**
- imageio: **2.34.1**

## Notes on models & performance
- The default model is `runwayml/stable-diffusion-v1-5`. You can point to any compatible diffusers checkpoint with `-ModelId` in `run_demo.ps1`.
- GPU is strongly recommended. CPU runs are possible but will be slow; reduce `-Steps` and `-Frames` if you only have CPU.
- The demo keeps prompts, schedulers, and seeds explicit so you can tweak them easily. Latent reuse is supported via `--reuse-latents` for slightly faster multi-frame runs.

## Troubleshooting
- If PyTorch installation fails, pass `-TorchIndexUrl` to `setup.ps1` with the exact wheel source you need (e.g., cu118). Example:
  ```pwsh
  ./setup.ps1 -TorchIndexUrl "https://download.pytorch.org/whl/cu118"
  ```
- For environments without GPU or with low VRAM, try `-UseCPU` and add `-Scheduler EulerAncestralDiscreteScheduler` plus fewer steps.
- If you hit authentication errors while downloading models, set `HF_TOKEN` before running scripts:
  ```pwsh
  $env:HF_TOKEN = "<your-token>"
  ```

## License
This folder reuses only permissively licensed dependencies from the Hugging Face ecosystem. Check each dependency’s license for details.
