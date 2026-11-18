"""Step 5 API tests for Station 03 endpoints."""

from starlette.testclient import TestClient
from fluidscope.server import app


client = TestClient(app)


def test_step5_station03_endpoints_and_js():
    for ep, payload in [
        ("/api/falkner_skan", {"beta": -0.18}),
        ("/api/bl_separation", {"lambda_pg": -14.0}),
        ("/api/couette_poiseuille", {"P": -3.0}),
        ("/api/two_layer", {"mu1": 0.005, "mu2": 0.001}),
        ("/api/slip_hb", {"n": 0.65, "tau_y": 2.5, "slip_length": 0.0002}),
    ]:
        r = client.post(ep, json=payload)
        assert r.status_code == 200
        d = r.json()["data"]
        assert "field_2d" in d
        assert len(d["field_2d"]["U"]) > 5

    js = client.get("/js/stations/station03.js")
    assert js.status_code == 200

