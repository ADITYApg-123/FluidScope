"""Tests for Step 6: Numba 2D D2Q9 Lattice-Boltzmann Tunnel."""

import numpy as np
import pytest
from fluidscope.core.lbm_tunnel import simulate_lbm_tunnel


def test_lbm_poiseuille_channel_benchmark():
    res = simulate_lbm_tunnel(preset="poiseuille", reynolds=40.0, n_steps=450, nx=96, ny=34)
    assert res["stable"] is True
    assert res["mass_fluid"] > 0
    prof = np.array(res["downstream_profile"]["u_over_Uin"])
    # Peak in channel core, near zero at top/bottom walls
    assert prof[len(prof) // 2] > 0.75
    assert abs(prof[0]) < 0.05
    assert abs(prof[-1]) < 0.05


def test_lbm_cylinder_wake_and_splitter_plate():
    cyl = simulate_lbm_tunnel(preset="cylinder", reynolds=105.0, n_steps=380, nx=140, ny=48)
    split = simulate_lbm_tunnel(preset="cylinder_splitter", reynolds=105.0, n_steps=380, nx=140, ny=48)
    assert cyl["stable"] is True
    assert split["stable"] is True
    assert len(cyl["solid_rects"]) > 5
    area_cyl = sum(r[2] * r[3] for r in cyl["solid_rects"])
    area_split = sum(r[2] * r[3] for r in split["solid_rects"])
    assert area_split > area_cyl
    # Custom circle obstacle also succeeds cleanly
    custom = simulate_lbm_tunnel(
        preset="custom",
        reynolds=80.0,
        n_steps=260,
        nx=110,
        ny=40,
        obstacles=[{"type": "circle", "x": 0.25, "y": 0.5, "r": 0.12}],
    )
    assert custom["stable"] is True
    assert len(custom["solid_rects"]) > 3
