"""Step 4 API & frontend static telemetry asset tests."""

from starlette.testclient import TestClient
from fluidscope.server import app


client = TestClient(app)


def test_step4_health_and_frontend_bundle_served():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True

    idx = client.get("/")
    assert idx.status_code == 200
    assert "FLUIDSCOPE" in idx.text
    assert "/js/app.js" in idx.text

    for path in ["/styles/telemetry.css", "/js/app.js", "/js/canvas_flow.js", "/js/canvas_plots.js", "/js/math_ui.js"]:
        res = client.get(path)
        assert res.status_code == 200


def test_step4_station02_endpoints_return_valid_physics():
    a = client.post("/api/audit", json={"steady": False, "irrotational": False})
    assert a.status_code == 200
    assert a.json()["data"]["bernoulli_status"]["valid_globally"] is False

    k = client.post("/api/kinematics", json={})
    assert k.status_code == 200
    assert len(k.json()["data"]["curves"]["streakline"]) > 10

    v = client.post("/api/vortex", json={"mode": "forced", "omega": 10.0, "r1": 0.1, "r2": 0.4})
    assert v.status_code == 200
    assert v.json()["data"]["probes"]["dp_true"] > 0
    assert v.json()["data"]["probes"]["dp_naive"] < 0

    vs = client.post("/api/vessel", json={"rpm": 130.0})
    assert vs.status_code == 200
    assert abs(vs.json()["data"]["uncovered_area"] - 0.116) < 0.003

    pot = client.post("/api/potential", json={"u_inf": 2.0, "doublets": [{"x": 0, "y": 0, "kappa": 12.56637}], "vortices": [{"x": 0, "y": 0, "gamma": -12.56637}]})
    assert pot.status_code == 200
    assert pot.json()["data"]["lift_per_unit_span"] > 0

