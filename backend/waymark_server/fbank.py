"""Log mel filterbank features matching SpeechBrain's Fbank(n_mels=80), in numpy (no torch needed)."""
import numpy as np

N_FFT = 400
HOP = 160
AMIN = 1e-10
TOP_DB = 80.0
_WINDOW = (0.54 - 0.46 * np.cos(2 * np.pi * np.arange(N_FFT) / N_FFT)).astype(np.float32)  # periodic Hamming


def fbank(wav: np.ndarray, mel_filters: np.ndarray) -> np.ndarray:
    """16 kHz mono float32 -> (frames, n_mels) sentence-mean-normalised log mel energies."""
    padded = np.pad(wav.astype(np.float32), N_FFT // 2)
    n_frames = 1 + (len(padded) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n_frames)[:, None]
    spec = np.fft.rfft(padded[idx] * _WINDOW, n=N_FFT, axis=1)
    power = (spec.real ** 2 + spec.imag ** 2).astype(np.float32)
    db = 10.0 * np.log10(np.maximum(power @ mel_filters, AMIN))
    db = np.maximum(db, db.max() - TOP_DB)
    return (db - db.mean(axis=0, keepdims=True)).astype(np.float32)
