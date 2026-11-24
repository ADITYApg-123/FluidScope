/**
 * Global Search Modal (Command Palette) for FluidScope AI.
 * Instant search indexing across all 12 Physics Labs, 12 Exam Traps, 12-Twist Quiz, Guided Lessons, and Tools.
 * Keyboard accessible with Ctrl+K / Cmd+K / Slash shortcuts, Arrow key traversal, and 1-click execution.
 */
import { LAB_CATALOG } from "../core/store.js";
import { LAB_OVERVIEW_META } from "../overview.js";

const TWIST_SEARCH_DATA = [
  {
    id: "TWIST-01",
    index: 0,
    title: "Unsteady Divergence: Streamline vs. Pathline vs. Streakline",
    ref: "Unsteady Flow Lines",
    prompt: "For unsteady flow u = x / (t + t0), v = v0, dye is continuously injected at (x0, y0). Instantaneous streamline, pathline, and streakline diverge into distinct curves.",
    shortcut: "Assuming particle trajectories and dye streaklines stay tangent to the instantaneous streamline.",
    bay: "02",
    sub: "kinematics",
  },
  {
    id: "TWIST-02",
    index: 1,
    title: "Free Vortex Right-Angled Bend: Radial Pressure & Normal Accel",
    ref: "Free Vortex Bend Radial Pressure",
    prompt: "Water flows in a horizontal 2D concentric bend as an irrotational free vortex. Bernoulli holds across distinct streamlines because Ωz = 0 and total head H is uniform.",
    shortcut: "Refusing Bernoulli between distinct streamlines because velocity changes with radius.",
    bay: "02",
    sub: "vortex",
  },
  {
    id: "TWIST-03",
    index: 2,
    title: "Forced Vortex Bernoulli Sign Reversal Trap",
    ref: "Forced Vortex Radial Pressure Equilibrium",
    prompt: "Solid-body rotation vθ = ωr produces non-zero vorticity Ωz = 2ω. Total head rises outward across streamlines: naive Bernoulli predicts opposite pressure sign.",
    shortcut: "Applying constant-head Bernoulli p1 + ½ρ(ωr1)² = p2 + ½ρ(ωr2)² across rotational streamlines.",
    bay: "02",
    sub: "vortex",
  },
  {
    id: "TWIST-04",
    index: 3,
    title: "Rotating Open Tank Spill & Base Uncovering",
    ref: "Open Rotating Paraboloid Rim Overflow",
    prompt: "Spinning an open tank at high RPM touches the top rim and spills liquid before uncovering a dry floor radius R1 at the center.",
    shortcut: "Assuming liquid volume stays conserved without rim overflow.",
    bay: "02",
    sub: "vessel",
  },
  {
    id: "TWIST-05",
    index: 4,
    title: "Rankine Combined Vortex Double Head Depression",
    ref: "Rankine Compound Vortex Core Matching",
    prompt: "Rigid forced core inside free vortex outer region produces double the surface depression v_max² / g compared to single dynamic head.",
    shortcut: "Using single dynamic head ½v_max²/g from far-field Bernoulli alone.",
    bay: "02",
    sub: "vortex",
  },
  {
    id: "TWIST-06",
    index: 5,
    title: "Free-Falling Perforated Tank No-Leak Trap",
    ref: "Non-Inertial Free-Fall Tank Hydrostatics",
    prompt: "In vertical free fall az = -g, effective gravity g_eff = g + az drops to zero. Hydrostatic pressure gradient vanishes and orifice efflux halts completely.",
    shortcut: "Applying static Torricelli v = √(2gh) to predict continuous leakage in free fall.",
    bay: "04",
    sub: "tank",
  },
  {
    id: "TWIST-07",
    index: 6,
    title: "Two-Layer Immiscible Channel Slope Kink",
    ref: "Two-Layer Immiscible Interface Shear Continuity",
    prompt: "Two liquids of unequal viscosity share continuous shear stress μ1(du1/dy) = μ2(du2/dy), producing a slope kink and shifting peak velocity into the less viscous layer.",
    shortcut: "Equating velocity gradients du1/dy = du2/dy across unequal viscosities.",
    bay: "03",
    sub: "twolayer",
  },
  {
    id: "TWIST-08",
    index: 7,
    title: "Couette-Poiseuille Zero-Net-Flux Recirculation",
    ref: "Generalized Couette-Poiseuille Backflow",
    prompt: "Adverse pressure gradient P balances moving-wall shear. Incipient reverse flow begins at P = -1, but net discharge Q vanishes only at P = -3.",
    shortcut: "Assuming net flow Q = 0 occurs right when lower wall shear reverses at P = -1.",
    bay: "03",
    sub: "couette",
  },
  {
    id: "TWIST-09",
    index: 8,
    title: "Boundary-Layer Inflection vs. Separation Criterion",
    ref: "Boundary Layer Separation & Adverse Pressure",
    prompt: "Adverse dp/dx > 0 forces positive wall curvature μ(∂²u/∂y²)|w > 0 and an interior inflection point, but flow detachment occurs where wall shear ∂u/∂y|w = 0.",
    shortcut: "Confusing interior inflection point with wall detachment or assuming potential Cp = 1 - 4sin²θ holds in separated wakes.",
    bay: "03",
    sub: "separation",
  },
  {
    id: "TWIST-10",
    index: 9,
    title: "Hydrophobic Slip + Herschel-Bulkley Yield Plug",
    ref: "Hydrophobic Slit Navier Slip & Yield Fluid",
    prompt: "Shear-thinning yield stress fluid forms a rigid flat plug core where |τ| ≤ τy, while hydrophobic boundary slip uw = ls|∂u/∂y|w elevates wall velocity.",
    shortcut: "Applying standard no-slip parabolic Poiseuille formulas to slipping non-Newtonian yield fluids.",
    bay: "03",
    sub: "slip_hb",
  },
  {
    id: "TWIST-11",
    index: 10,
    title: "Borda-Carnot Sudden Pipe Expansion Pressure Trap",
    ref: "Borda-Carnot Sudden Pipe Expansion Momentum",
    prompt: "Corner eddies hold shoulder pressure p' ≈ p1, producing Borda–Carnot momentum loss hL = (V1 - V2)²/2g rather than frictionless Bernoulli recovery.",
    shortcut: "Using ideal Bernoulli Δp = ½ρ(V1² - V2²) which ignores annular dead-zone turbulence.",
    bay: "04",
    sub: "expansion",
  },
  {
    id: "TWIST-12",
    index: 11,
    title: "Sluice-Gate Hydraulic Jump Energy vs. Momentum",
    ref: "Hydraulic Jump Specific Force & Roller Dissipation",
    prompt: "Turbulent roller eddies dissipate mechanical head hj = (h2 - h1)³ / (4h1h2). Conjugate depth follows specific force momentum conservation, not constant energy.",
    shortcut: "Solving constant specific energy Es(h2) = Es(h1) across a jump, which severely overpredicts depth.",
    bay: "04",
    sub: "jump",
  },
];

const GUIDED_LESSONS = [
  { id: "LESSON-2A", bay: "02", sub: "kinematics", title: "Lesson 2A: Unsteady Kinematics & Stokes' Check", topic: "Streamlines, Pathlines & Streaklines", trap: "Assuming streaklines equal streamlines in unsteady flows" },
  { id: "LESSON-2B", bay: "02", sub: "vortex", title: "Lesson 2B: Rankine & Forced Vortex Trap", topic: "Vorticity, Euler Radial Balance & Bernoulli", trap: "Applying constant-head Bernoulli across rotational streamlines" },
  { id: "LESSON-2C", bay: "02", sub: "vessel", title: "Lesson 2C: Rotating Tank Rim Spill & Uncovering", topic: "Parabolic Meniscus, Rim Overflow & Dry Radius R1", trap: "Conserving total fluid volume when liquid spills overhead" },
  { id: "LESSON-2D", bay: "02", sub: "potential", title: "Lesson 2D: Magnus Cylinder Lift & Circulation", topic: "Kutta–Joukowski Lift, Doublet & Stagnation Detachment", trap: "Expecting stagnation points to remain on cylinder wall at high Gamma" },
];

const APP_TOOLS = [
  { id: "TOOL-OVERVIEW", title: "Overview Landing Page", subtitle: "Browse all 12 interactive simulators and guided lessons", action: { type: "view", view: "overview" }, badge: "View" },
  { id: "TOOL-TRANSLATOR", title: "AI Problem Translator", subtitle: "Paste fluid mechanics text, audit assumptions, and extract 2D governing equations", action: { type: "view", view: "01" }, badge: "Bay 01" },
  { id: "TOOL-LABS", title: "Physics Labs Workbench", subtitle: "Interactive 2D vector canvas, curve plots, probe telemetry, and parameter sliders", action: { type: "view", view: "labs" }, badge: "Workbench" },
  { id: "TOOL-QUIZ", title: "12-Twist Exam Quiz Bank", subtitle: "Test intuition against 12 tricky textbook problems with instant solver verification", action: { type: "view", view: "05" }, badge: "Bay 05" },
];

function buildSearchIndex() {
  const index = [];

  // 1. All 12 Labs
  LAB_CATALOG.forEach((lab) => {
    const meta = LAB_OVERVIEW_META[lab.id] || {};
    const textParts = [
      lab.id,
      lab.label,
      lab.shortLabel,
      lab.chapter,
      lab.category,
      meta.tag || "",
      meta.topic || "",
      meta.desc || "",
      meta.callout || "",
      meta.twistSummary || "",
    ];
    index.push({
      id: `lab-${lab.id}`,
      group: "labs",
      groupLabel: "Physics Labs",
      groupIcon: "🧪",
      badge: `Lab ${lab.id}`,
      title: lab.label,
      subtitle: `${lab.chapter} · ${meta.topic || meta.tag || lab.category}`,
      description: meta.desc || "",
      searchableText: textParts.join(" ").toLowerCase(),
      action: { type: "lab", bay: lab.bay, sub: lab.sub },
    });
  });

  // 2. Exam Traps & Misconceptions
  LAB_CATALOG.forEach((lab) => {
    const meta = LAB_OVERVIEW_META[lab.id] || {};
    if (!meta.callout) return;
    const textParts = [
      lab.id,
      lab.label,
      lab.chapter,
      "exam trap",
      "misconception",
      "shortcut",
      meta.callout,
      meta.twistSummary || "",
      meta.topic || "",
    ];
    index.push({
      id: `trap-${lab.id}`,
      group: "traps",
      groupLabel: "Exam Traps",
      groupIcon: "⚠️",
      badge: `Trap ${lab.id}`,
      title: `${lab.id} · ${meta.callout.replace(/^Exam Trap:\s*/i, "")}`,
      subtitle: `${lab.label} · Core Twist: ${meta.twistSummary || meta.topic || ""}`,
      description: meta.callout,
      searchableText: textParts.join(" ").toLowerCase(),
      action: { type: "lab", bay: lab.bay, sub: lab.sub },
    });
  });

  // 3. 12-Twist Quiz Problems
  TWIST_SEARCH_DATA.forEach((tw) => {
    const textParts = [
      tw.id,
      tw.title,
      tw.ref,
      tw.prompt,
      tw.shortcut,
      "quiz",
      "exam twist",
    ];
    index.push({
      id: `twist-${tw.id}`,
      group: "twists",
      groupLabel: "12-Twist Quiz Bank",
      groupIcon: "🎯",
      badge: tw.id,
      title: tw.title,
      subtitle: `${tw.ref} · Trap: ${tw.shortcut}`,
      description: tw.prompt,
      searchableText: textParts.join(" ").toLowerCase(),
      action: { type: "twist", index: tw.index },
    });
  });

  // 4. Guided Lessons
  GUIDED_LESSONS.forEach((lesson) => {
    const textParts = [
      lesson.id,
      lesson.title,
      lesson.topic,
      lesson.trap,
      "guided lesson",
      "tutorial",
      "walkthrough",
    ];
    index.push({
      id: `lesson-${lesson.id}`,
      group: "lessons",
      groupLabel: "Guided Lessons",
      groupIcon: "📚",
      badge: "Lesson",
      title: lesson.title,
      subtitle: `${lesson.topic} · Focus: ${lesson.trap}`,
      description: `Step-by-step guided tutorial with interactive formulas and live probe verification.`,
      searchableText: textParts.join(" ").toLowerCase(),
      action: { type: "lesson", bay: lesson.bay, sub: lesson.sub },
    });
  });

  // 5. Workbench Tools & Views
  APP_TOOLS.forEach((tool) => {
    const textParts = [tool.id, tool.title, tool.subtitle, "workbench", "tool", "view"];
    index.push({
      id: tool.id,
      group: "tools",
      groupLabel: "Workbench Navigation",
      groupIcon: "🛠️",
      badge: tool.badge,
      title: tool.title,
      subtitle: tool.subtitle,
      description: tool.subtitle,
      searchableText: textParts.join(" ").toLowerCase(),
      action: tool.action,
    });
  });

  return index;
}

export function initSearchModal(handlers = {}) {
  const backdrop = document.getElementById("searchModalBackdrop");
  const panel = document.getElementById("searchModalPanel");
  const input = document.getElementById("globalSearchInput");
  const closeBtn = document.getElementById("searchCloseBtn");
  const resultsContainer = document.getElementById("searchResultsList");
  const resultCount = document.getElementById("searchResultCount");
  const triggerBtn = document.getElementById("searchTriggerBtn");

  if (!backdrop || !panel || !input || !resultsContainer) return;

  const searchIndex = buildSearchIndex();
  let currentResults = [];
  let selectedIndex = 0;

  function highlightMatches(text, queryTerms) {
    if (!text) return "";
    let safe = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (!queryTerms || !queryTerms.length) return safe;

    const regex = new RegExp(`(${queryTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return safe.replace(regex, `<mark class="search-highlight">$1</mark>`);
  }

  function search(query) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      // Default recommended quick jumps when search box is empty
      const defaultPicks = [
        ...searchIndex.filter((it) => it.group === "labs").slice(0, 4),
        ...searchIndex.filter((it) => it.group === "lessons").slice(0, 2),
        ...searchIndex.filter((it) => it.group === "twists").slice(0, 2),
        ...searchIndex.filter((it) => it.group === "tools"),
      ];
      return { results: defaultPicks, terms: [], isDefault: true };
    }

    const terms = trimmed.split(/\s+/).filter(Boolean);

    const scored = [];
    for (const item of searchIndex) {
      // Every term must be present
      const matchesAll = terms.every((t) => item.searchableText.includes(t));
      if (!matchesAll) continue;

      let score = 0;
      const titleLower = item.title.toLowerCase();
      const badgeLower = item.badge.toLowerCase();
      const subtitleLower = item.subtitle.toLowerCase();

      terms.forEach((t) => {
        if (badgeLower === t || badgeLower.includes(t)) score += 120;
        if (titleLower.startsWith(t)) score += 90;
        else if (titleLower.includes(t)) score += 60;
        if (subtitleLower.includes(t)) score += 35;
        if (item.description.toLowerCase().includes(t)) score += 20;
      });

      scored.push({ item, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return { results: scored.map((s) => s.item).slice(0, 20), terms, isDefault: false };
  }

  function renderResults({ results, terms, isDefault }) {
    currentResults = results;
    selectedIndex = 0;

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="search-empty-state">
          <div class="search-empty-icon">🔍</div>
          <div class="search-empty-title">No matching topics found</div>
          <div class="search-empty-hint">Try searching for <strong>vortex</strong>, <strong>Bernoulli</strong>, <strong>separation</strong>, <strong>jump</strong>, <strong>couette</strong>, or <strong>LBM</strong>.</div>
        </div>
      `;
      if (resultCount) resultCount.textContent = "0 results found";
      return;
    }

    // Group items by category
    const groups = [];
    const groupMap = new Map();

    results.forEach((item, idx) => {
      if (!groupMap.has(item.group)) {
        const groupObj = {
          group: item.group,
          label: item.groupLabel,
          icon: item.groupIcon,
          items: [],
        };
        groupMap.set(item.group, groupObj);
        groups.push(groupObj);
      }
      groupMap.get(item.group).items.push({ item, globalIdx: idx });
    });

    resultsContainer.innerHTML = groups
      .map(
        (g) => `
        <div class="search-result-group" role="group" aria-label="${g.label}">
          <div class="search-group-header">
            <span>${g.icon} ${g.label}</span>
          </div>
          ${g.items
            .map(({ item, globalIdx }) => {
              const isSelected = globalIdx === selectedIndex;
              const titleHtml = highlightMatches(item.title, terms);
              const subHtml = highlightMatches(item.subtitle, terms);
              return `
              <div
                class="search-result-item ${isSelected ? "selected" : ""}"
                role="option"
                aria-selected="${isSelected ? "true" : "false"}"
                data-idx="${globalIdx}"
                id="searchOpt-${globalIdx}"
              >
                <div class="search-item-main">
                  <div class="search-item-header">
                    <span class="search-item-badge badge-${item.group}">${item.badge}</span>
                    <span class="search-item-title">${titleHtml}</span>
                  </div>
                  <div class="search-item-subtitle">${subHtml}</div>
                </div>
                <div class="search-item-arrow" aria-hidden="true">&rarr;</div>
              </div>
            `;
            })
            .join("")}
        </div>
      `
      )
      .join("");

    if (resultCount) {
      resultCount.textContent = isDefault
        ? "Quick Recommendations · Type to search all topics"
        : `${results.length} result${results.length === 1 ? "" : "s"} found`;
    }

    updateSelectedItemUI();
  }

  function updateSelectedItemUI() {
    const items = resultsContainer.querySelectorAll(".search-result-item");
    items.forEach((el) => {
      const idx = Number(el.dataset.idx);
      const isSel = idx === selectedIndex;
      el.classList.toggle("selected", isSel);
      el.setAttribute("aria-selected", String(isSel));
      if (isSel) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  function executeItem(item) {
    if (!item) return;
    closeModal();
    const action = item.action;
    if (!action) return;

    if (action.type === "lab") {
      handlers.openLab?.(action.bay, action.sub);
    } else if (action.type === "lesson") {
      handlers.openLab?.(action.bay, action.sub);
      setTimeout(() => {
        document.getElementById("btnOpenLesson")?.click();
      }, 250);
    } else if (action.type === "twist") {
      handlers.openTwist?.(action.index);
    } else if (action.type === "view") {
      handlers.openView?.(action.view);
    }
  }

  function openModal() {
    backdrop.classList.remove("hidden");
    input.value = "";
    const searchData = search("");
    renderResults(searchData);
    requestAnimationFrame(() => {
      input.focus();
    });
  }

  function closeModal() {
    if (backdrop.classList.contains("hidden")) return;
    backdrop.classList.add("hidden");
    input.blur();
  }

  // Trigger button click
  if (triggerBtn) {
    triggerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openModal();
    });
  }

  // Close button click
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeModal();
    });
  }

  // Backdrop click to dismiss
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closeModal();
    }
  });

  // Input typing listener
  input.addEventListener("input", () => {
    const res = search(input.value);
    renderResults(res);
  });

  // Clicking an item in results
  resultsContainer.addEventListener("click", (e) => {
    const itemEl = e.target.closest(".search-result-item");
    if (!itemEl) return;
    const idx = Number(itemEl.dataset.idx);
    if (currentResults[idx]) {
      executeItem(currentResults[idx]);
    }
  });

  // Key navigation inside input and panel
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }

    if (currentResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % currentResults.length;
      updateSelectedItemUI();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
      updateSelectedItemUI();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentResults[selectedIndex]) {
        executeItem(currentResults[selectedIndex]);
      }
    }
  });

  // Global Keyboard Shortcut: Ctrl+K / Cmd+K / Slash key
  window.addEventListener("keydown", (e) => {
    const isCtrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
    const isSlash = e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

    if (isCtrlK || isSlash) {
      e.preventDefault();
      if (backdrop.classList.contains("hidden")) {
        openModal();
      } else {
        closeModal();
      }
    }
  });

  return { openModal, closeModal };
}
