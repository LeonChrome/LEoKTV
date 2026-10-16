"""CPU MDX inference using NumPy/SciPy + ONNX Runtime (no Torch runtime).

STFT tensor layout and overlap weighting follow the MIT-licensed UVR /
audio-separator MDX implementation. See THIRD_PARTY_NOTICES.md.
"""
import math
import numpy as np
from scipy.fft import rfft, irfft
from scipy.signal import resample_poly

N_FFT = 5120
DIM_F = 2560
HOP = 1024
FRAMES = 256
CHUNK = HOP * (FRAMES - 1)
WINDOW = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N_FFT) / N_FFT)).astype(np.float32)


def stft(wave):
    padded = np.pad(wave, ((0, 0), (N_FFT // 2, N_FFT // 2)), mode='reflect')
    frames = np.lib.stride_tricks.sliding_window_view(padded, N_FFT, axis=-1)[:, ::HOP, :]
    spectrum = rfft(frames * WINDOW, axis=-1).transpose(0, 2, 1)[:, :DIM_F]
    return np.stack((spectrum.real, spectrum.imag), axis=1).reshape(1, 4, DIM_F, -1).astype(np.float32)


def istft(spectrum):
    paired = spectrum.reshape(2, 2, DIM_F, -1)
    complex_spectrum = paired[:, 0] + 1j * paired[:, 1]
    complex_spectrum = np.pad(complex_spectrum, ((0, 0), (0, N_FFT // 2 + 1 - DIM_F), (0, 0)))
    frames = irfft(complex_spectrum.transpose(0, 2, 1), n=N_FFT, axis=-1) * WINDOW
    frame_count = frames.shape[1]
    length = HOP * (frame_count - 1) + N_FFT
    result = np.zeros((2, length), dtype=np.float32)
    divider = np.zeros(length, dtype=np.float32)
    for index in range(frame_count):
        start = index * HOP
        result[:, start:start + N_FFT] += frames[:, index]
        divider[start:start + N_FFT] += WINDOW ** 2
    result /= np.maximum(divider, 1e-8)
    return result[:, N_FFT // 2: -N_FFT // 2]


def separate_audio(model, audio, sample_rate, progress):
    import onnxruntime as ort
    if audio.ndim == 1:
        audio = np.repeat(audio[:, None], 2, axis=1)
    audio = audio[:, :2].T.astype(np.float32)
    if sample_rate != 44100:
        gcd = math.gcd(sample_rate, 44100)
        audio = resample_poly(audio, 44100 // gcd, sample_rate // gcd, axis=-1).astype(np.float32)
    if not np.isfinite(audio).all() or audio.shape[-1] == 0:
        raise ValueError('音频为空或包含无效采样值')
    # Scale only inputs that would clip, retaining the original mix loudness.
    scale = max(1.0, float(np.max(np.abs(audio))))
    mix = audio / scale
    options = ort.SessionOptions()
    options.intra_op_num_threads = min(4, __import__('os').cpu_count() or 1)
    options.enable_mem_pattern = False
    session = ort.InferenceSession(str(model), sess_options=options, providers=['CPUExecutionProvider'])
    shape = session.get_inputs()[0].shape
    if shape[1:] != [4, DIM_F, FRAMES]:
        raise ValueError(f'不支持的模型输入形状: {shape}')
    trim = N_FFT // 2
    gen = CHUNK - 2 * trim
    pad = gen + trim - (mix.shape[-1] % gen)
    padded = np.pad(mix, ((0, 0), (trim, pad)))
    result = np.zeros_like(padded)
    divider = np.zeros(padded.shape[-1], dtype=np.float32)
    starts = list(range(0, padded.shape[-1], int(CHUNK * .75)))
    for index, start in enumerate(starts):
        end = min(start + CHUNK, padded.shape[-1])
        length = end - start
        chunk = np.pad(padded[:, start:end], ((0, 0), (0, CHUNK - length)))
        spectrum = stft(chunk)
        spectrum[:, :, :3] = 0
        prediction = session.run(None, {session.get_inputs()[0].name: spectrum})[0]
        output = istft(prediction)[:, :length]
        weight = np.hanning(length).astype(np.float32)
        result[:, start:end] += output * weight
        divider[start:end] += weight
        progress((index + 1) / len(starts))
    instrumental = (result / np.maximum(divider, 1e-8))[:, trim:trim + mix.shape[-1]] * scale
    vocals = audio - instrumental * 1.019
    return vocals.T, instrumental.T, 44100
