"""Step 6 API tests for Station 04 conservation & LBM endpoints."""

from starlette.testclient import TestClient
from fluidscope.server import app


client = TestClient(app)


def test_step6_station04_endpoints_and_js():
    hj = client.post("/api/hydraulic_jump", json={"width": 6.1, "v1": 6.1, "discharge": 11.32})
    assert hj.status_code == 200
    assert abs(hj.json()["data"]["Fr1"] - 3.53) < 0.02

    ex = client.post("/api/sudden_expansion", json={"D1": 0.1, "D2": 0.2, "V1": 4.0})
    assert ex.status_code == 200
    assert ex.json()["data"]["dp_naive"] > ex.json()["data"]["dp_true"]

    tk = client.post("/api/accel_tank", json={"ax": 0.0, "az": -9.81})
    assert tk.status_code == 200
    assert tk.json()["data"]["orifice_v_true"] == 0.0

    lbm = client.post("/api/lbm_tunnel", json={"preset": "cylinder_splitter", "reynolds": 90.0, "n_steps": 150})
    assert lbm.status_code == 200
    assert lbm.json()["data"]["stable"] is True

    js = client.get("/js/stations/station04.js")
    assert js.status_code == 200

