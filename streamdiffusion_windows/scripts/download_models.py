"""Download diffusers models for offline use."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from huggingface_hub import snapshot_download


def parse_args():
    parser = argparse.ArgumentParser(description="Prefetch a diffusers model from Hugging Face")
    parser.add_argument("--model-id", default="runwayml/stable-diffusion-v1-5", help="Model repo id")
    parser.add_argument(
        "--local-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "models" / "stable-diffusion",
        help="Where to save the snapshot",
    )
    parser.add_argument(
        "--revision",
        default=None,
        help="Optional model revision/tag",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    token = os.environ.get("HF_TOKEN")
    path = snapshot_download(
        repo_id=args.model_id,
        cache_dir=args.local_dir,
        token=token,
        revision=args.revision,
        local_dir=args.local_dir,
        local_dir_use_symlinks=False,
    )
    print(f"Saved snapshot to {path}")


if __name__ == "__main__":
    main()
