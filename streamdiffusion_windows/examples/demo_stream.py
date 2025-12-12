"""Example script for generating a short Stream Diffusion run."""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from streamdiffusion import StreamConfig, StreamDiffusionRunner  # noqa: E402


SCHEDULERS = {
    "ddim": "DDIMScheduler",
    "dpm": "DPMSolverMultistepScheduler",
    "euler_a": "EulerAncestralDiscreteScheduler",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a StreamDiffusion-style demo")
    parser.add_argument("--prompt", required=True, help="Positive prompt text")
    parser.add_argument("--negative-prompt", default=None, help="Negative prompt text")
    parser.add_argument("--frames", type=int, default=4, help="Number of frames to generate")
    parser.add_argument("--steps", type=int, default=30, help="Denoising steps per frame")
    parser.add_argument("--guidance", type=float, default=7.5, help="Classifier-free guidance scale")
    parser.add_argument("--seed", type=int, default=42, help="Base random seed")
    parser.add_argument("--model-id", default="runwayml/stable-diffusion-v1-5", help="Diffusers model id or path")
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu", help="Device for inference")
    parser.add_argument(
        "--dtype",
        default="auto",
        choices=["auto", "fp16", "fp32"],
        help="Torch dtype for weights",
    )
    parser.add_argument(
        "--scheduler",
        default="dpm",
        choices=list(SCHEDULERS.keys()),
        help="Scheduler name (mapped to Diffusers)",
    )
    parser.add_argument("--output", type=Path, default=ROOT / "outputs", help="Folder to save results")
    parser.add_argument("--reuse-latents", action="store_true", help="Re-use latents between frames")
    parser.add_argument("--seed-stride", type=int, default=1, help="Seed increment per frame")
    parser.add_argument("--make-gif", action="store_true", help="Save an animated GIF")
    parser.add_argument("--make-video", action="store_true", help="Save an MP4 video")
    parser.add_argument("--height", type=int, default=None, help="Optional height override")
    parser.add_argument("--width", type=int, default=None, help="Optional width override")
    parser.add_argument("--offload", action="store_true", help="Enable CPU offload for low VRAM")
    parser.add_argument("--download-only", action="store_true", help="Download weights then exit")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    torch_dtype = {
        "auto": torch.float16 if args.device.startswith("cuda") else torch.float32,
        "fp16": torch.float16,
        "fp32": torch.float32,
    }[args.dtype]

    config = StreamConfig(
        prompt=args.prompt,
        negative_prompt=args.negative_prompt,
        guidance_scale=args.guidance,
        num_inference_steps=args.steps,
        seed=args.seed,
        width=args.width,
        height=args.height,
        reuse_latents=args.reuse_latents,
    )

    output_dir = args.output / datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[setup] Using device={args.device}, model={args.model_id}, dtype={torch_dtype}")
    runner = StreamDiffusionRunner(
        model_id=args.model_id,
        device=args.device,
        torch_dtype=torch_dtype,
        scheduler_name=SCHEDULERS[args.scheduler],
        offload_to_cpu=args.offload,
    )

    if args.download_only:
        print("[download] Model weights pulled down; exiting")
        return

    frames = runner.stream(
        config=config,
        num_frames=args.frames,
        seed_stride=args.seed_stride,
        callback=lambda i, _: print(f"[frame] generated {i}")
    )
    runner.save_stream(frames, output_dir, make_gif=args.make_gif, make_mp4=args.make_video)
    print(f"[done] Saved frames to {output_dir}")


if __name__ == "__main__":
    main()
