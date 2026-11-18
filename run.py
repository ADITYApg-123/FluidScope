"""Convenience entry point to launch FluidScope AI Aerospace Telemetry Bench."""

import threading
import time
import webbrowser
import uvicorn


def main(host: str = "127.0.0.1", port: int = 8050, open_browser: bool = True) -> None:
    url = f"http://{host}:{port}"
    if open_browser:
        def _open() -> None:
            time.sleep(0.9)
            webbrowser.open(url)
        threading.Thread(target=_open, daemon=True).start()
    print(f"FLUIDSCOPE // AEROSPACE TELEMETRY BENCH running at {url}")
    uvicorn.run("fluidscope.server:app", host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()

