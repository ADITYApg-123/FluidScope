"""Port-safe Starlette TestClient contract tests for FluidScope AI Wave 2 UI & API integration."""

from __future__ import annotations

import math
import pytest
from starlette.testclient import TestClient

from fluidscope.server import app


client = TestClient(app)


def test_all_modular_css_and_js_assets_return_200():
    assets = [
        "/",
        "/styles/telemetry.css",
        "/styles/tokens.css",
        "/styles/layout.css",
        "/styles/canvas.css",
        "/styles/labs.css",
        "/styles/quiz.css",
        "/styles/coach.css",
        "/js/app.js",
        "/js/overview.js",
        "/js/math_ui.js",
        "/js/canvas_flow.js",
        "/js/canvas_plots.js",
        "/js/core/store.js",
        "/js/core/color_scales.js",
        "/js/core/equation_strip.js",
        "/js/components/coach_drawer.js",
        "/js/stations/scene_mapper.js",
        "/js/stations/station01.js",
        "/js/stations/station02.js",
        "/js/stations/station03.js",
        "/js/stations/station04.js",
        "/js/stations/station05.js",
        "/js/stations/mappers_kinematics.js",
        "/js/stations/mappers_viscous.js",
        "/js/stations/mappers_conservation.js",
    ]
    for path in assets:
        resp = client.get(path)
        assert resp.status_code == 200, f"Asset {path} returned {resp.status_code}"
        assert len(resp.content) > 0, f"Asset {path} was empty"


def test_index_html_workbench_shell_contracts():
    resp = client.get("/")
    assert resp.status_code == 200
    html = resp.text
    assert 'data-theme="light"' in html
    assert '/styles/telemetry.css' in html
    for elem_id in [
        'id="labSelectorStrip"',
        'id="btnPrevLab"',
        'id="btnNextLab"',
        'id="btnOpenCoach"',
        'id="assumptionAccordionBtn"',
        'id="coachDrawerHost"',
        'id="plotDataTableToggle"',
        'id="flowPlayPauseBtn"',
        'id="themeToggleBtn"',
    ]:
        assert elem_id in html, f"Missing shell landmark {elem_id}"


def test_lbm_tunnel_custom_obstacle_endpoint():
    resp = client.post(
        "/api/lbm_tunnel",
        json={
            "preset": "custom",
            "reynolds": 100.0,
            "n_steps": 200,
            "customObstacles": [{"type": "circle", "x": 0.25, "y": 0.5, "r": 0.1}],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    data = body["data"]
    assert data["stable"] is True
    solid_count = sum(1 for row in data["field_2d"]["solid"] for cell in row if cell)
    assert solid_count > 0


def test_audit_contexts_and_twists_metadata():
    for ctx in ["ns_x", "radial_euler", "specific_force", "frame_g_eff", "boundary_layer"]:
        resp = client.post(
            "/api/audit",
            json={"steady": True, "incompressible": True, "inviscid": True, "irrotational": True, "equation_context": ctx},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["data"]["equation_context"]["id"] == ctx
        assert isinstance(body["data"].get("terms"), list) and len(body["data"]["terms"]) >= 1

    tw_resp = client.get("/api/twists")
    assert tw_resp.status_code == 200
    twists = tw_resp.json()["data"]
    assert len(twists) == 12
    for tw in twists:
        assert tw["tempting_shortcut"]
        assert isinstance(tw["broken_assumptions"], list)
        assert tw["endpoint"].startswith("/api/")
        assert isinstance(tw["payload"], dict)
        assert 0 <= tw["correct_index"] < len(tw["options"])


def test_favicon_and_api_edge_contracts():
    fav = client.get("/favicon.ico")
    assert fav.status_code == 200
    assert len(fav.content) > 0

    bad_kin = client.post(
        "/api/kinematics",
        json={"u_str": "x + t", "v_str": "0", "params": {"t": 5.0}},
    )
    assert bad_kin.status_code == 400
    assert bad_kin.json()["ok"] is False
    assert "reserved" in bad_kin.json()["error"].lower()

    obs_resp = client.post(
        "/api/lbm_tunnel",
        json={
            "reynolds": 80.0,
            "n_steps": 120,
            "obstacles": [{"type": "circle", "x": 0.25, "y": 0.5, "r": 0.1}],
        },
    )
    assert obs_resp.status_code == 200
    obs_data = obs_resp.json()["data"]
    assert obs_data["preset"] == "custom"
    assert obs_data["stable"] is True

    twists = client.get("/api/twists").json()["data"]
    expected = {
        "TWIST-01": "kinematics_equation",
        "TWIST-03": "vortex_flow",
        "TWIST-06": "accelerating_tank",
        "TWIST-08": "couette_poiseuille",
        "TWIST-11": "sudden_expansion",
    }
    for tw in twists:
        if tw["id"] in expected:
            r = client.post(
                "/api/parse_and_solve",
                json={"text": tw["prompt"], "llm_config": {"provider": "offline"}},
            )
            assert r.status_code == 200, f"{tw['id']} crashed: {r.text}"
            body = r.json()
            assert body["ok"] is True
            assert body["data"]["parsed"]["family"] == expected[tw["id"]]
            assert isinstance(body["data"]["solver_data"], dict)


def test_parse_and_solve_all_12_twists_physical_sanity():
    twists = client.get("/api/twists").json()["data"]
    assert len(twists) == 12
    by_id = {tw["id"]: tw for tw in twists}

    expected_families = {
        "TWIST-01": "kinematics_equation",
        "TWIST-02": "vortex_flow",
        "TWIST-03": "vortex_flow",
        "TWIST-04": "rotating_vessel",
        "TWIST-05": "vortex_flow",
        "TWIST-06": "accelerating_tank",
        "TWIST-07": "two_layer_poiseuille",
        "TWIST-08": "couette_poiseuille",
        "TWIST-09": "bl_separation",
        "TWIST-10": "slip_herschel_bulkley",
        "TWIST-11": "sudden_expansion",
        "TWIST-12": "hydraulic_jump",
    }

    results = {}
    for tw_id, exp_fam in expected_families.items():
        r = client.post(
            "/api/parse_and_solve",
            json={"text": by_id[tw_id]["prompt"], "llm_config": {"provider": "offline"}},
        )
        assert r.status_code == 200, f"{tw_id} HTTP {r.status_code}: {r.text}"
        body = r.json()
        assert body["ok"] is True
        data = body["data"]
        assert data["parsed"]["family"] == exp_fam
        assert len(data["audit"]["terms"]) == 5
        results[tw_id] = data

    # TWIST-01: unsteady compressible kinematics with diverging curves
    d1 = results["TWIST-01"]["solver_data"]
    assert d1["classification"]["steady"] is False
    assert d1["classification"]["incompressible"] is False
    assert d1["classification"]["irrotational"] is True
    assert d1["point_probe"]["ax_local"] + d1["point_probe"]["ax_convective"] == pytest.approx(
        d1["point_probe"]["ax"], abs=1e-9
    )
    assert d1["curves"]["streamline"][-1][0] != pytest.approx(d1["curves"]["pathline"][-1][0], abs=1e-3)

    # TWIST-02: free vortex (irrotational, Bernoulli matches radial Euler)
    d2 = results["TWIST-02"]["solver_data"]
    assert d2["mode"] == "free"
    assert d2["bernoulli_globally_valid"] is True
    assert d2["probes"]["dp_discrepancy"] == pytest.approx(0.0, abs=1e-3)

    # TWIST-03: forced vortex (rotational, Bernoulli sign reversal)
    d3 = results["TWIST-03"]["solver_data"]
    assert d3["mode"] == "forced"
    assert d3["bernoulli_globally_valid"] is False
    assert d3["probes"]["dp_true"] > 0.0
    assert d3["probes"]["dp_naive"] < 0.0
    assert d3["probes"]["head_gain_r1_to_r2"] > 0.0

    # TWIST-04: open rotating cylinder spill + uncovered base at 130 rpm
    d4 = results["TWIST-04"]["solver_data"]
    assert results["TWIST-04"]["parsed"]["params"]["rpm"] == pytest.approx(130.0)
    assert d4["paraboloid_height"] > 0.0
    assert d4["radius"] == pytest.approx(0.30, rel=1e-3)
    assert d4["uncovered_area"] == pytest.approx(0.11545, abs=0.005)
    assert len(d4["r"]) == len(d4["z_surface"]) and len(d4["r"]) > 10

    # TWIST-05: Rankine combined vortex
    d5 = results["TWIST-05"]["solver_data"]
    assert d5["mode"] == "rankine"
    assert d5["bernoulli_globally_valid"] is False
    assert d5["probes"]["rankine_total_depression"] > 0.0
    assert d5["probes"]["head_gain_r1_to_r2"] > 0.0

    # TWIST-06: free-falling perforated tank stops leaking
    d6 = results["TWIST-06"]["solver_data"]
    assert results["TWIST-06"]["parsed"]["params"]["az"] == pytest.approx(-9.81, abs=1e-6)
    assert d6["g_effective"] == pytest.approx(0.0, abs=1e-9)
    assert d6["orifice_v_true"] == pytest.approx(0.0, abs=1e-9)
    assert d6["orifice_v_naive_static"] > 0.0

    # TWIST-07: two-layer immiscible channel slope kink & peak shift
    d7 = results["TWIST-07"]["solver_data"]
    assert d7["mu1"] != d7["mu2"]
    assert d7["interface_slope_1"] != d7["interface_slope_2"]
    assert d7["y_peak"] > 0.0

    # TWIST-08: Couette-Poiseuille opposing PG backflow
    d8 = results["TWIST-08"]["solver_data"]
    assert results["TWIST-08"]["parsed"]["params"]["P"] < -1.0
    assert min(d8["u_over_U"]) < 0.0

    # TWIST-09: boundary-layer separation
    d9 = results["TWIST-09"]["solver_data"]
    assert d9["wall_curvature_dimless"] > 0.0
    assert d9["inflection_eta"] is not None
    assert d9["separated"] is True

    # TWIST-10: Navier slip 0.25 mm = 0.00025 m + Herschel-Bulkley plug
    d10 = results["TWIST-10"]["solver_data"]
    assert results["TWIST-10"]["parsed"]["params"]["slip_length"] == pytest.approx(0.00025, rel=1e-6)
    assert 0.0 < d10["u_slip_wall"] < 50.0
    assert 0.0 < d10["plug_fraction"] < 1.0
    assert d10["q_true"] > 0.0

    # TWIST-11: Borda-Carnot sudden expansion
    d11 = results["TWIST-11"]["solver_data"]
    assert 0.0 < d11["D1"] < d11["D2"]
    assert 0.0 < d11["dp_true"] < d11["dp_naive"]
    assert d11["head_loss_hL"] > 0.0

    # TWIST-12: hydraulic jump 11.32 m³/s
    d12 = results["TWIST-12"]["solver_data"]
    assert results["TWIST-12"]["parsed"]["params"]["discharge"] == pytest.approx(11.32, rel=1e-4)
    assert d12["Q_total"] == pytest.approx(11.32, rel=1e-4)
    assert d12["Fr1"] > 1.0
    assert d12["h1"] < d12["h2_true"] < d12["h2_naive_bernoulli"]
    assert d12["head_loss_hj"] > 0.0


def test_api_parser_defects_and_kinematics_complex_weak_singularity():
    tank_resp = client.post(
        "/api/parse_and_solve",
        json={"text": "Accelerating tank with ax = 0.0, az = -9.81m/s^2", "llm_config": {"provider": "offline"}},
    )
    assert tank_resp.status_code == 200
    tank_data = tank_resp.json()["data"]
    assert tank_data["solver_data"]["g_effective"] == pytest.approx(0.0, abs=1e-9)
    assert tank_data["solver_data"]["orifice_v_true"] == pytest.approx(0.0, abs=1e-9)

    pot_resp = client.post(
        "/api/parse_and_solve",
        json={
            "text": "Uniform stream plus doublet and clockwise circulation around cylinder, Magnus lift, angle of attack alpha = 10 deg",
            "llm_config": {"provider": "offline"},
        },
    )
    assert pot_resp.status_code == 200
    pot_data = pot_resp.json()["data"]
    assert pot_data["parsed"]["params"]["u_inf"] == pytest.approx(2.0)
    assert pot_data["parsed"]["params"]["alpha_deg"] == pytest.approx(10.0)
    assert pot_data["solver_data"]["lift_per_unit_span"] > 0.0

    bad_kin = client.post("/api/kinematics", json={"u_str": "sqrt(-1)*x", "v_str": "0"})
    assert bad_kin.status_code == 400
    assert bad_kin.json()["ok"] is False
    assert "complex" in bad_kin.json()["error"].lower()

    bad_parse = client.post(
        "/api/parse_and_solve",
        json={"text": "u = sqrt(-1)*x, v = 0", "llm_config": {"provider": "offline"}},
    )
    assert bad_parse.status_code == 400
    assert bad_parse.json()["ok"] is False

    weak_kin = client.post(
        "/api/kinematics",
        json={
            "u_str": "-0.005*y/(x^2+y^2)",
            "v_str": "0.005*x/(x^2+y^2)",
            "loop_center": [0.15, 0.1],
            "loop_radius": 0.6,
        },
    )
    assert weak_kin.status_code == 200
    weak_data = weak_kin.json()["data"]
    assert weak_data["stokes_check"]["singularity_suspected"] is True
    assert weak_data["stokes_check"]["circulation_line"] == pytest.approx(2.0 * math.pi * 0.005, rel=1e-3)
