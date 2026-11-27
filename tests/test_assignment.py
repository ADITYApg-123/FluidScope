"""Tests for Assignment Workspace backend solver (/api/assignment/derive) and custom SymPy derivations."""

from starlette.testclient import TestClient

from fluidscope.server import app
from fluidscope.core.assignment_solver import solve_and_derive_assignment


client = TestClient(app)


def test_hw1_custom_velocity_sympy_offline_derivation():
    res = solve_and_derive_assignment(
        {
            "hw_id": "hw1",
            "u_str": "x / (t + t0)",
            "v_str": "v0",
            "params": {"t0": 1.0, "v0": 1.0, "x0": 1.0, "y0": 0.0, "t_eval": 2.0, "nondim": True},
            "use_ai": False,
        }
    )
    assert res["provider_used"] == "sympy_deterministic"
    curves = res["kin_data"]["curves"]
    assert len(curves["streamline"]) > 5
    assert len(curves["pathline"]) > 5
    assert len(curves["streakline"]) > 5
    assert "a" in res["steps_by_subpart"]
    assert "d" in res["steps_by_subpart"]
    assert len(res["steps_by_subpart"]["a"]) >= 1


def test_hw2_custom_rotational_vortex_sympy_diagnostics():
    res = client.post(
        "/api/assignment/derive",
        json={
            "hw_id": "hw2",
            "u_str": "-A * y",
            "v_str": "A * x",
            "params": {"A": 1.5, "u_str": "-A * y", "v_str": "A * x", "x1": 0.5, "x2": 1.1, "y1": 0.2, "y2": 0.8, "tau_end": 1.5},
            "use_ai": False,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    data = body["data"]
    diag = data["kin_data"]["point_probe"]
    assert abs(diag["divergence"]) < 1e-6
    assert abs(diag["vorticity_z"] - 3.0) < 1e-4
    assert "e" in data["steps_by_subpart"]


def test_hw1_unsafe_expression_returns_error():
    res = client.post(
        "/api/assignment/derive",
        json={
            "hw_id": "hw1",
            "u_str": "__import__('os').system('echo bad')",
            "v_str": "1",
            "params": {},
            "use_ai": False,
        },
    )
    assert res.status_code == 400
    assert res.json()["ok"] is False
    assert "error" in res.json()


def test_hw4_ai_request_without_key_returns_clean_fallback():
    res = client.post(
        "/api/assignment/derive",
        json={
            "hw_id": "hw4",
            "subpart": "4.1c",
            "params": {"section": "p1", "theta_deg": 12, "h0": 1.0, "R_top": 0.4, "Ae": 0.002},
            "computed_summary": {"te_cone_s": 50.1, "te_cyl_s": 113.4},
            "use_ai": True,
            "llm_config": {"provider": "offline", "api_key": ""},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["data"]["provider_used"] == "analytical_exact"
