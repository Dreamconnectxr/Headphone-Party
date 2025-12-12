"""
A lightweight, Windows-friendly Stream Diffusion helper built on top of
Hugging Face Diffusers. It keeps configuration explicit, supports latent reuse
between frames, and exposes a generator interface for streaming output.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Generator, Iterable, Optional

import torch
from diffusers import (
    AutoPipelineForText2Image,
    DDIMScheduler,
    DPMSolverMultistepScheduler,
    EulerAncestralDiscreteScheduler,
)
from PIL import Image


@dataclass
class StreamConfig:
    prompt: str
    negative_prompt: Optional[str] = None
    guidance_scale: float = 7.5
    num_inference_steps: int = 30
    height: Optional[int] = None
    width: Optional[int] = None
    seed: int = 42
    reuse_latents: bool = True


class StreamDiffusionRunner:
    """Small wrapper around a Diffusers text-to-image pipeline.

    The real StreamDiffusion project focuses on real-time performance. This
    implementation favors clarity and self-contained defaults while still
    offering a streaming-style generator API.
    """

    def __init__(
        self,
        model_id: str = "runwayml/stable-diffusion-v1-5",
        device: str = "cuda",
        torch_dtype: torch.dtype = torch.float16,
        scheduler_name: str = "DPMSolverMultistepScheduler",
        offload_to_cpu: bool = False,
    ) -> None:
        self.model_id = model_id
        self.device = device
        self.torch_dtype = torch_dtype
        self.pipe = AutoPipelineForText2Image.from_pretrained(
            model_id,
            torch_dtype=torch_dtype,
            use_safetensors=True,
        )
        self.pipe.scheduler = self._build_scheduler(scheduler_name)
        if offload_to_cpu:
            self.pipe.enable_model_cpu_offload()
        else:
            self.pipe.to(device)

    def _build_scheduler(self, name: str):
        current = self.pipe.scheduler
        if name == "DDIMScheduler":
            return DDIMScheduler.from_config(current.config)
        if name == "EulerAncestralDiscreteScheduler":
            return EulerAncestralDiscreteScheduler.from_config(current.config)
        return DPMSolverMultistepScheduler.from_config(current.config)

    def generate_frame(
        self, config: StreamConfig, latents: Optional[torch.Tensor] = None
    ) -> tuple[Image.Image, Optional[bool]]:
        generator = torch.Generator(device=self.device).manual_seed(config.seed)
        result = self.pipe(
            prompt=config.prompt,
            negative_prompt=config.negative_prompt,
            guidance_scale=config.guidance_scale,
            num_inference_steps=config.num_inference_steps,
            height=config.height,
            width=config.width,
            generator=generator,
            latents=latents,
        )
        detected = result.nsfw_content_detected
        if isinstance(detected, (list, tuple)):
            detected = detected[0] if detected else None
        return result.images[0], detected

    def stream(
        self,
        config: StreamConfig,
        num_frames: int = 4,
        seed_stride: int = 1,
        callback: Optional[Callable[[int, Image.Image], None]] = None,
    ) -> Generator[Image.Image, None, None]:
        latents: Optional[torch.Tensor] = None
        for i in range(num_frames):
            config.seed += seed_stride if i else 0
            image, nsfw = self.generate_frame(config, latents=latents if config.reuse_latents else None)
            if nsfw:
                print("[warn] NSFW content detected; image may be filtered by the model")
            if callback:
                callback(i, image)
            if config.reuse_latents:
                latents = self.pipe.prepare_latents(
                    batch_size=1,
                    width=image.width,
                    height=image.height,
                    generator=torch.Generator(device=self.device).manual_seed(config.seed + 17),
                    dtype=self.torch_dtype,
                    device=self.device,
                )
            yield image

    def save_stream(
        self,
        frames: Iterable[Image.Image],
        output_dir: Path,
        make_gif: bool = False,
        make_mp4: bool = False,
        fps: int = 4,
    ) -> None:
        output_dir.mkdir(parents=True, exist_ok=True)
        frames = list(frames)
        for idx, frame in enumerate(frames):
            frame.save(output_dir / f"frame_{idx:03d}.png")
        if make_gif:
            try:
                import imageio

                gif_path = output_dir / "stream.gif"
                imageio.mimsave(gif_path, frames, fps=fps)
                print(f"Saved GIF to {gif_path}")
            except Exception as exc:  # pragma: no cover - optional dependency path
                print(f"[warn] Unable to build GIF: {exc}")
        if make_mp4:
            try:
                import imageio

                mp4_path = output_dir / "stream.mp4"
                imageio.mimwrite(mp4_path, frames, fps=fps)
                print(f"Saved MP4 to {mp4_path}")
            except Exception as exc:  # pragma: no cover - optional dependency path
                print(f"[warn] Unable to build MP4: {exc}")
