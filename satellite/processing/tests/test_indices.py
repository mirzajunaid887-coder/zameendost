import sys, pathlib
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from indices import ndvi, ndmi, field_stats


def test_ndvi_hand_values():
    assert ndvi([0.5], [0.1])[0] == (0.5 - 0.1) / (0.5 + 0.1)
    assert np.isnan(ndvi([0.0], [0.0])[0])


def test_ndmi_dry_vs_wet_canopy():
    assert ndmi([0.4], [0.15])[0] > ndmi([0.4], [0.35])[0]


def test_clouds_are_excluded_and_sparse_data_returns_none():
    idx = np.full((4, 4), 0.6); scl = np.full((4, 4), 4); inside = np.ones((4, 4))
    assert field_stats(idx, scl, inside)["mean"] == 0.6
    scl[:2, :] = 9  # half cloudy -> exactly 50% valid still allowed
    assert field_stats(idx, scl, inside)["valid_fraction"] == 0.5
    scl[:3, :] = 9  # 25% valid -> unusable
    assert field_stats(idx, scl, inside) is None


def test_pixels_outside_polygon_ignored_and_empty_polygon_none():
    idx = np.array([[0.2, 0.9]]); scl = np.array([[4, 4]])
    assert field_stats(idx, scl, np.array([[1, 0]]))["mean"] == 0.2
    assert field_stats(idx, scl, np.array([[0, 0]])) is None
