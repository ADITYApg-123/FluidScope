"""Port-safe Starlette TestClient contract tests for FluidScope AI Wave 2 UI & API integration."""

from __future__ import annotations

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
