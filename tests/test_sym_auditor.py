"""Tests for Step 1: SymPy equation & assumption auditor."""

from fluidscope.core.sym_auditor import AssumptionState, audit_assumptions


def test_ideal_irrotational_flow_enables_global_bernoulli():
    res = audit_assumptions(AssumptionState(
        steady=True,
        incompressible=True,
        inviscid=True,
        irrotational=True,
        inertial_frame=True,
        irreversible_jump=False,
    ))
    assert res["bernoulli_status"]["valid_along_streamline"] is True
    assert res["bernoulli_status"]["valid_globally"] is True
    assert len(res["warnings"]) == 0
    local = next(t for t in res["terms"] if t["id"] == "local_inertia")
    visc = next(t for t in res["terms"] if t["id"] == "viscous_stress")
    assert local["active"] is False
    assert visc["active"] is False
    lhs_tex = res["symbolic"]["momentum_x_tex"].split("=")[0]
    assert r"\frac{\partial}{\partial t}" not in lhs_tex
    assert "(x, y)" in res["symbolic"]["continuity_tex"].replace(" ", "") or r"\left(x,y" in res["symbolic"]["continuity_tex"].replace(" ", "")


def test_rotational_forced_vortex_breaks_global_bernoulli_only():
    res = audit_assumptions({"steady": True, "inviscid": True, "irrotational": False})
    assert res["bernoulli_status"]["valid_along_streamline"] is True
    assert res["bernoulli_status"]["valid_globally"] is False
    assert "4.43" in res["symbolic"]["cross_stream_tex"]
    assert any("Ωz" in w for w in res["warnings"])


def test_viscous_unsteady_and_slip_activate_terms():
    res = audit_assumptions({
        "steady": False,
        "inviscid": False,
        "irrotational": False,
        "no_slip": False,
        "newtonian": False,
        "inertial_frame": False,
        "adverse_pressure_gradient": True,
        "irreversible_jump": True,
    })
    assert res["bernoulli_status"]["valid_along_streamline"] is False
    assert res["bernoulli_status"]["valid_globally"] is False
    active_ids = {t["id"] for t in res["terms"] if t["active"]}
    assert {"local_inertia", "convective_inertia", "pressure_grad", "viscous_stress", "frame_pseudo"} <= active_ids
    assert "l_s" in res["symbolic"]["wall_bc_tex"]
    assert len(res["warnings"]) == 8
