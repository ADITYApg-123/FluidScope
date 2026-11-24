# FluidScope AI — Interactive Fluid Mechanics Workbench

🌐 **Live Interactive Website:** **[https://fluidscope.onrender.com/](https://fluidscope.onrender.com/)**

**FluidScope AI** is an interactive fluid mechanics workbench and 60fps flow telemetry lab for engineering students and educators.

Instead of passively solving toy problems or generating hallucinated diagrams from an LLM, FluidScope enforces a strict **Neuro-Symbolic Architecture**:

1. **AI Translation + Symbolic Grounding (`fluidscope/ai/`, `fluidscope/core/sym_auditor.py`):** Natural-language exam problems, `u(x,y,t) / v(x,y,t)` equations, or 2D obstacle geometries are translated into strict Pydantic contracts (`ParsedPhysicsQuery`), audited symbolically in SymPy to strike out/highlight active governing terms, and dispatched directly into verified differential/integral/lattice-Boltzmann solvers.
2. **True Physics vs. Tempting Exam Shortcut:** Every view contrasts the **True Governing Solution** (**Signal Amber `#E6A23C`**) against the common **Naive Shortcut Trap** (**Alert Coral `#E05A47`** dashed curves and discrepancy shading).
3. **Aerospace Telemetry Bench UI (`web/`):** Built cleanly in vanilla ES modules, `HTML5 <canvas>` 60fps Lagrangian tracer/probe engines, and `KaTeX` math—with zero third-party UI templates.

---

## Workstation Stations (`01` – `05`)

| Station | Name | Core Capabilities & Physics |
| :--- | :--- | :--- |
| **01** | **Text-to-Visual AI & Doubt Coach** | Translates raw problem statements, vector fields (`u = ..., v = ...`), or 2D tunnel obstacles into live simulations, syncs governing rockers, honestly rejects out-of-scope 3D compressible/turbomachinery requests, and runs a solver-grounded Doubt Coach (`Offline Deterministic`, `Google Gemini`, or `OpenAI / Groq / Ollama`). |
| **02** | **Kinematics & Vortex Lab** (`Ch. 3, 4.5, 7`) | **2A:** Whitelisted SymPy field parser, divergence, vorticity $\Omega_z$, strain, local+convective acceleration, SciPy `solve_ivp` streamlines vs. pathlines vs. streaklines (Ex. 3.10), deforming fluid square, and Stokes loop $\oint \mathbf{V}\cdot d\mathbf{s} = \iint \Omega_z\,dA$. **2B:** Free vs. Forced vs. Rankine vs. Spiral vortices (`Eq. 4.43–4.60`). **2C:** Rotating cylinder spill & base uncovering (Ex. 4.8). **2D:** Potential superposition & Kutta–Joukowski Magnus lift. |
| **03** | **Viscous Twists & BL Separation** (`Ch. 1.6, 8.3, 9`) | **3A:** Exact Falkner–Skan similarity BVP + Pohlhausen adverse-pressure separation & wall-curvature inflection point ($\partial^2 u/\partial y^2|_w > 0$) + cylinder $C_p(\theta)$ D'Alembert paradox. **3B:** Generalized Couette–Poiseuille (`Ex. 8.4`: zero shear at $P=-1$, zero net flux at $P=-3$). **3C:** Two-layer immiscible channel (`Ex. 8.2` shear continuity slope kink). **3D:** Navier wall slip + Herschel–Bulkley yield plug flow. |
| **04** | **Conservation Traps & 2D LBM Tunnel** (`Ch. 2.9, 10–12`) | **4A:** Numba `@njit` 2D D2Q9 BGK Lattice-Boltzmann wind tunnel (`cylinder`, `cylinder_splitter`, `backward_step`, `tandem_cylinders`, and AI-parsed custom primitives) with live vorticity street & wake probe. **4B:** Hydraulic jump (`Ex. 12.11–12.12`) conjugate depth vs. constant-$E_s$ trap. **4C:** Borda–Carnot sudden expansion (`Eq. 11.18–11.23`). **4D:** Non-inertial & free-fall perforated tank (`p. 99` no-leak trap). |
| **05** | **12-Problem Concept-Twist Bank** | Interactive **Predict First $\rightarrow$ Verify Live** conceptual diagnostic suite spanning Ex. 3.10, Ex. 4.7–4.8, Rankine double head drop, Ch. 2.9 free-fall tank, Ex. 8.2, Ex. 8.4, BL inflection/separation, Herschel–Bulkley slip, Borda–Carnot expansion, and Ex. 12.11–12.12 hydraulic jump. |

---

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```
Or editable install:
```bash
pip install -e .
```

### 2. Launch FluidScope AI
```bash
python run.py
```
Then open **`http://127.0.0.1:8050/`** in your browser.

---

## Configuring Online AI Providers (Optional)

FluidScope works **100% offline out of the box** via deterministic physics-cue + SymPy parsing and solver-grounded coaching.

To enable optional LLM translation and dialogue coaching:
- Click **`AI: OFFLINE MODE`** in the top-right status bar of the UI to select:
  - **Google Gemini (`google-genai`)**: supply a key or set `GEMINI_API_KEY` (defaults to `gemini-2.5-flash`).
  - **OpenAI / Groq / Ollama REST (`httpx`)**: set your base URL (e.g., `http://localhost:11434/v1` for local Ollama, `https://api.groq.com/openai/v1`, or `https://api.openai.com/v1`), model name, and optional key (`OPENAI_API_KEY`).

---

## Verification & Analytical Benchmark Suite

Run the full automated verification suite (`pytest`):

```bash
pytest -v
```

Includes quantitative assertions against analytical fluid mechanics benchmarks and exact governing limits:
- **Kinematics:** Unsteady field exponential streamline, linear pathline, and hyperbolic streakline separation + Stokes circulation theorem.
- **Vortex Dynamics:** Free-vortex bend radial Euler match ($\Delta p = 16\,\text{kPa}$) vs. Forced-vortex Bernoulli sign reversal + Rotating vessel base uncovering ($\pi R_1^2 \approx 0.116\,\text{m}^2$ at `130 rpm`).
- **Viscous & Boundary Layer:** Blasius skin friction ($C_f\sqrt{Re_x} = 0.6641$), Falkner–Skan separation limit ($\beta \to -0.1988$), Couette–Poiseuille $Q=0$ at $P=-3$, Two-layer shear continuity kink, and Navier slip / Herschel–Bulkley analytical flux.
- **Conservation & CFD:** Hydraulic jump momentum conservation, Borda–Carnot expansion, free-fall zero-efflux trap, and Numba D2Q9 Poiseuille & Kármán wake splitter-plate damping.
- **API & End-to-End Integration:** All 12 Twist Bank problems, all 13 `ParsedPhysicsQuery` prompt families + honest 3D rejection, static web bundle serving, and grounded doubt-coach endpoints.
