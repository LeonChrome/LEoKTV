#!/usr/bin/env python3
"""Local MDX worker prototype for the Tauri JSON-lines boundary.

The worker is intentionally optional and is not bundled in the current preview.
It requires the separately licensed audio-separator model/runtime environment.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def reject(request_id: str, message: str) -> None:
    emit({"id": request_id, "event": "error", "error": message})


def separate(request: dict) -> None:
    request_id = str(request.get("id", "unknown"))
    input_path = Path(str(request.get("input", ""))).expanduser().resolve()
    output_dir = Path(str(request.get("output_dir", ""))).expanduser().resolve()
    model_path = Path(str(request.get("model", ""))).expanduser().resolve()
    if not input_path.is_file():
        reject(request_id, "input file does not exist")
        return
    if not model_path.is_file():
        reject(request_id, "verified model file does not exist")
        return
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        from audio_separator.separator import Separator
    except ImportError:
        reject(request_id, "audio-separator is not installed in the worker environment")
        return

    try:
        emit({"id": request_id, "event": "progress", "value": 0.05, "stage": "load-model"})
        separator = Separator(
            model_file_dir=str(model_path.parent),
            output_dir=str(output_dir),
            output_format="WAV",
            sample_rate=44100,
            mdx_params={
                "hop_length": 1024,
                "segment_size": 256,
                "overlap": 0.25,
                "batch_size": 1,
                "enable_denoise": False,
            },
        )
        separator.load_model(model_filename=model_path.name)
        emit({"id": request_id, "event": "progress", "value": 0.15, "stage": "inference"})
        outputs = separator.separate(str(input_path))
        output_paths = [str(Path(item).resolve()) for item in outputs]
        vocals = next((path for path in output_paths if "vocals" in Path(path).stem.lower()), None)
        instrumental = next((path for path in output_paths if any(token in Path(path).stem.lower() for token in ("instrumental", "accompaniment"))), None)
        emit({
            "id": request_id,
            "event": "complete",
            "value": 1,
            "vocals": vocals,
            "instrumental": instrumental,
            "outputs": output_paths,
        })
    except Exception as error:  # worker boundary must return JSON instead of crashing the host
        reject(request_id, str(error))


def main() -> int:
    for raw_line in sys.stdin:
        if not raw_line.strip():
            continue
        try:
            request = json.loads(raw_line)
        except json.JSONDecodeError as error:
            reject("unknown", f"invalid JSON request: {error}")
            continue
        request_id = str(request.get("id", "unknown"))
        if request.get("op") == "ping":
            emit({"id": request_id, "event": "ready", "worker": "mdx-prototype"})
        elif request.get("op") == "separate":
            separate(request)
        else:
            reject(request_id, "unsupported operation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
