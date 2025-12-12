"""Minimal img2img example for Windows-friendly StreamDiffusion setup.

This script loads a tiny diffusers image-to-image pipeline, builds a simple
init image, and saves an edited result. It is intentionally small so it can
serve as a sanity check without downloading full Stable Diffusion weights.
"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

import torch
from diffusers import AutoPipelineForImage2Image
from PIL import Image, ImageDraw


DEFAULT_MODEL_ID = "hf-internal-testing/tiny-stable-diffusion-torch"


def build_init_image(width: int, height: int) -> Image.Image:
    """Create a simple gradient + shapes init image to exercise img2img."""
    base = Image.new("RGB", (width, height), color=(120, 120, 200))
    draw = ImageDraw.Draw(base)
    draw.rectangle((width // 8, height // 8, width * 7 // 8, height * 7 // 8), outline=(20, 180, 80), width=3)
    draw.ellipse((width // 3, height // 3, width * 2 // 3, height * 2 // 3), fill=(255, 220, 120))
    draw.text((width // 10, height // 10), "init", fill=(0, 0, 0))
    return base


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a tiny img2img sanity check")
    parser.add_argument("--prompt", default="a colorful painting of a robot", help="Text prompt to guide the edit")
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID, help="Diffusers image2image pipeline id")
    parser.add_argument("--num-steps", type=int, default=4, help="Number of inference steps (keep low for the tiny model)")
    parser.add_argument("--strength", type=float, default=0.7, help="How much to transform the init image")
    parser.add_argument("--guidance", type=float, default=7.0, help="Classifier-free guidance scale")
    parser.add_argument("--height", type=int, default=128, help="Init image height")
    parser.add_argument("--width", type=int, default=128, help="Init image width")
    parser.add_argument(
        "--output-dir",
        default=Path("streamdiffusion_windows/outputs/img2img"),
        type=Path,
        help="Directory to save the init and result images",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    device = "cpu"
    pipe = AutoPipelineForImage2Image.from_pretrained(args.model_id, torch_dtype=torch.float32)
    pipe.to(device)

    init_image = build_init_image(args.width, args.height)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = Path(args.output_dir) / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)

    result = pipe(
        prompt=args.prompt,
        image=init_image,
        strength=args.strength,
        guidance_scale=args.guidance,
        num_inference_steps=args.num_steps,
    ).images[0]

    init_path = output_dir / "init.png"
    result_path = output_dir / "result.png"
    init_image.save(init_path)
    result.save(result_path)

    print(f"Saved init image to {init_path}")
    print(f"Saved img2img result to {result_path}")


if __name__ == "__main__":
    main()
