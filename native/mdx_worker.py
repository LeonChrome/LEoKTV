#!/usr/bin/env python3
"""Offline CPU MDX worker. Only the verified model download uses the network."""
from __future__ import annotations
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
import subprocess
from pathlib import Path

MODEL_NAME = 'UVR-MDX-NET-Inst_HQ_4.onnx'
MODEL_URL = 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/' + MODEL_NAME
MODEL_BYTES = 59074342
MODEL_SHA256 = '3c4b5b9b05090fdf238f38ba5046813982d50e2a652e9cb3324ea79720c3c9c8'
ENGINE_VERSION = 'mdx-hq4-cpu-1'


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_model(root, progress):
    target = root / 'models' / MODEL_NAME
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.stat().st_size == MODEL_BYTES and sha256_file(target) == MODEL_SHA256:
        return target
    partial = target.with_suffix('.partial')
    try:
        with urllib.request.urlopen(MODEL_URL, timeout=60) as response, partial.open('wb') as stream:
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > MODEL_BYTES:
                    raise ValueError('模型下载超过预期大小')
                stream.write(chunk)
                progress('download', total / MODEL_BYTES)
        if total != MODEL_BYTES or sha256_file(partial) != MODEL_SHA256:
            raise ValueError('MDX 模型校验失败，下载内容不完整，请重试')
        os.replace(partial, target)
        return target
    except urllib.error.HTTPError as error:
        raise ValueError(f'MDX 模型下载失败（HTTP {error.code}），请检查网络后重试') from error
    except urllib.error.URLError as error:
        raise ValueError('无法连接 MDX 模型下载服务器，请检查网络后重试') from error
    except TimeoutError as error:
        raise ValueError('MDX 模型下载超时，请检查网络后重试') from error
    finally:
        partial.unlink(missing_ok=True)


def process(request):
    import soundfile as sf
    import numpy as np
    from mdx_engine import separate_audio
    root = Path(request['root']).resolve()
    input_path = Path(request['input']).resolve()
    if not input_path.is_relative_to(root) or not input_path.is_file():
        raise ValueError('输入文件必须位于应用数据目录')
    request_id = str(request.get('id', 'mdx'))
    progress = lambda stage, value: emit({'id': request_id, 'event': 'progress', 'stage': stage, 'value': value})
    progress('verify-model', 0)
    model = ensure_model(root, progress)
    key = hashlib.sha256((sha256_file(input_path) + MODEL_SHA256 + ENGINE_VERSION).encode()).hexdigest()
    job_dir = root / 'separated' / key
    job_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = job_dir / 'metadata.json'
    vocals_path, instrumental_path = job_dir / 'vocals.wav', job_dir / 'instrumental.wav'
    if metadata_path.is_file() and vocals_path.is_file() and instrumental_path.is_file():
        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        if all(sha256_file(job_dir / name) == metadata['hashes'][name] for name in ('vocals.wav', 'instrumental.wav')):
            emit({'event': 'complete', 'vocals': str(vocals_path), 'instrumental': str(instrumental_path), 'cached': True})
            return
    try:
        audio, sr = sf.read(input_path, dtype='float32', always_2d=True)
    except Exception:
        # libsndfile on Windows may not decode MP3; use the bundled LGPL FFmpeg binary.
        import imageio_ffmpeg
        command = [imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(input_path), '-f', 'f32le', '-ac', '2', '-ar', '44100', 'pipe:1']
        raw = subprocess.check_output(command)
        audio, sr = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2), 44100
    progress('inference', 0)
    vocals, instrumental, sr = separate_audio(model, audio, sr, lambda value: progress('inference', value))
    if not np.isfinite(vocals).all() or not np.isfinite(instrumental).all():
        raise ValueError('模型输出包含无效采样值')
    for path, samples in ((vocals_path, vocals), (instrumental_path, instrumental)):
        temporary = path.with_suffix('.partial')
        sf.write(temporary, samples, sr, format='WAV', subtype='FLOAT')
        os.replace(temporary, path)
    metadata = {'engine': ENGINE_VERSION, 'model_sha256': MODEL_SHA256, 'sample_rate': sr,
                'frames': len(vocals), 'hashes': {p.name: sha256_file(p) for p in (vocals_path, instrumental_path)}}
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    emit({'event': 'complete', 'vocals': str(vocals_path), 'instrumental': str(instrumental_path), 'cached': False})


def main():
    lines = [sys.argv[2]] if len(sys.argv) == 3 and sys.argv[1] == '--once' else sys.stdin
    failed = False
    for raw in lines:
        try:
            request = json.loads(raw)
            if request.get('op') == 'ping':
                emit({'event': 'ready', 'engine': ENGINE_VERSION})
            elif request.get('op') == 'process':
                process(request)
            else:
                raise ValueError('不支持的操作')
        except Exception as error:
            emit({'event': 'error', 'error': str(error)})
            failed = True
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
