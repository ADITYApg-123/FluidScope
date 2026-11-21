"""API & End-to-End Integration Tests for Step 7 (Stations 01 & 05 + Full Twist Bank)."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from fluidscope.server import app


client = TestClient(app)


def test_health_and_static_assets():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["stations_ready"] == ["01", "02", "03", "04", "05"]

    for asset in [
        "/",
        "/styles/telemetry.css",
        "/js/app.js",
        "/js/math_ui.js",
        "/js/canvas_flow.js",
        "/js/canvas_plots.js",
        "/js/stations/scene_mapper.js",
        "/js/stations/station01.js",
        "/js/stations/station03.js",
        "/js/stations/station04.js",
        "/js/stations/station05.js",
    ]:
        res = client.get(asset)
        assert res.status_code == 200, f"Static asset {asset} failed with {res.status_code}"


def test_twist_bank_all_12_problems_execute_end_to_end():
    r = client.get("/api/twists")
    assert r.status_code == 200
    twists = r.json()["data"]
    assert len(twists) == 12

    for t in twists:
        assert 0 <= t["correct_index"] < len(t["options"])
        resp = client.post(t["endpoint"], json=t["payload"])
        assert resp.status_code == 200, f"{t['id']} failed: {resp.text}"
        data = resp.json()
        assert data["ok"] is True
        assert isinstance(data["data"], dict)
        if t["endpoint"] == "/api/vessel":
            assert "field_2d" in data["data"] and "bounds" in data["data"]["field_2d"]


@pytest.mark.parametrize(
    "prompt,expected_family",
    [
        ("u = x/(t+t0), v = v0 at t0 = 1, t = 2", "kinematics_equation"),
        ("Check Bernoulli trap in forced vortex omega = 12 inner radius 0.1 m outer radius 0.4 m", "vortex_flow"),
        ("Open cylinder tank 130 rpm height 0.503 m spills and uncovers center", "rotating_vessel"),
        ("6.1 m wide channel 11.32 m^3/s at 6.1 m/s forms a hydraulic jump", "hydraulic_jump"),
        ("Sudden expansion from 0.10 m to 0.20 m at 4 m/s Borda Carnot", "sudden_expansion"),
        ("Open tank falls vertically in free fall with orifice hole at bottom", "accelerating_tank"),
        ("Two-layer immiscible channel Ex 8.2 flow between plates", "two_layer_poiseuille"),
        ("Couette Poiseuille flow between moving plate and fixed plate at zero net flow", "couette_poiseuille"),
        ("Shear thinning paste flow with yield stress 3 Pa and Navier slip 0.25 mm", "slip_herschel_bulkley"),
        ("Boundary layer separation with adverse pressure gradient inflection point", "bl_separation"),
        ("Exact Falkner-Skan similarity equation at beta = -0.12", "falkner_skan"),
        ("Simulate 2D flow past a circular cylinder with horizontal splitter plate behind at Re = 110", "lbm_tunnel"),
        ("Compute 3D supersonic oblique shock inside a centrifugal compressor impeller", "unsupported_3d"),
    ],
)
def test_parse_and_solve_all_families(prompt: str, expected_family: str):
    r = client.post("/api/parse_and_solve", json={"text": prompt, "llm_config": {"provider": "offline"}})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    data = body["data"]
    assert data["parsed"]["family"] == expected_family
    if expected_family == "unsupported_3d":
        assert data["solver_data"] is None
        assert data["parsed"]["unsupported_reason"]
    else:
        assert isinstance(data["solver_data"], dict)


def test_hydraulic_jump_explicit_depth_and_width_regex():
    r = client.post(
        "/api/parse_and_solve",
        json={"text": "Hydraulic jump with depth = 0.35 m and width = 4.0 m at velocity 6.1 m/s"},
    )
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["parsed"]["family"] == "hydraulic_jump"
    assert d["solver_data"]["h1"] == pytest.approx(0.35, rel=1e-4)
    assert d["solver_data"]["width"] == pytest.approx(4.0, rel=1e-4)


def test_grounded_coach_endpoint():
    parsed_res = client.post(
        "/api/parse_and_solve",
        json={"text": "6.1 m wide rectangular channel carries 11.32 m^3/s at 6.1 m/s and forms hydraulic jump"},
    ).json()["data"]

    coach_res = client.post(
        "/api/coach",
        json={
            "question": "Why did Bernoulli overpredict h2 here?",
            "parsed": parsed_res["parsed"],
            "solver_data": parsed_res["solver_data"],
            "llm_config": {"provider": "offline"},
        },
    )
    assert coach_res.status_code == 200
    reply = coach_res.json()["data"]
    assert reply["provider_used"] == "offline_grounded_coach"
    assert len(reply["grounded_facts"]) >= 2
    assert "Hydraulic Jump" in reply["textbook_citation"]
    assert "3.53" in reply["answer"]
