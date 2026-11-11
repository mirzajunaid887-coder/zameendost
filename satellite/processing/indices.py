"""Sentinel-2 L2A field statistics (pure functions; no downloads here).

SCL (scene classification) classes treated as unusable: 0 no data, 1 saturated/defective, 3 cloud shadow,
8 cloud medium prob, 9 cloud high prob, 10 thin cirrus, 11 snow/ice. Reflectance inputs are surface reflectance 0..1.
If too few valid pixels remain, the result is None: callers must show "no usable observation", never a filled value.
"""
from __future__ import annotations
import numpy as np

BAD_SCL = (0, 1, 3, 8, 9, 10, 11)


def _safe_ratio(a, b):
    a = np.asarray(a, dtype="float64"); b = np.asarray(b, dtype="float64")
    s = a + b
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(np.abs(s) > 1e-9, (a - b) / s, np.nan)


def ndvi(nir, red): return _safe_ratio(nir, red)
def ndmi(nir, swir): return _safe_ratio(nir, swir)


def field_stats(index: np.ndarray, scl: np.ndarray, inside: np.ndarray, min_valid_fraction: float = 0.5):
    """Mean/median/std of `index` over pixels inside the field polygon that are cloud-free. None if unusable."""
    inside = inside.astype(bool)
    total = int(inside.sum())
    if total == 0:
        return None
    ok = inside & ~np.isin(scl, BAD_SCL) & np.isfinite(index)
    frac = float(ok.sum()) / total
    if frac < min_valid_fraction:
        return None
    v = index[ok]
    return {"mean": float(v.mean()), "median": float(np.median(v)), "std": float(v.std()), "valid_fraction": frac, "n_pixels": int(ok.sum())}
