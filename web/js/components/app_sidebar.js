/**
 * App Sidebar & Textbook Curriculum Tree Component for FluidScope AI.
 * Provides collapsible navigation drawer with:
 * - Direct view switcher (Overview, Physics Labs, AI Tutor, 12-Twist Quiz)
 * - 12 Active interactive lab direct links
 * - 16-Chapter textbook syllabus tree (Som, Biswas & Chakraborty 3rd Ed.)
 */

import { TEXTBOOK_CURRICULUM } from "../core/textbook_curriculum.js";
import { LAB_CATALOG } from "../core/store.js";

let sidebarHost = null;
let currentActiveView = "overview";

export function initAppSidebar({ openView, openLab }) {
  sidebarHost = document.getElementById("appSidebar");
  const toggleBtn = document.getElementById("sidebarToggleBtn");
  const backdrop = document.getElementById("sidebarBackdrop");

  if (!sidebarHost) return;

  renderSidebarContent({ openView, openLab });

  // Toggle behavior
  if (toggleBtn) {
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      const isCollapsed = sidebarHost.classList.toggle("collapsed");
      toggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
      if (backdrop) {
        backdrop.classList.toggle("visible", !isCollapsed && window.innerWidth <= 900);
      }
    };
  }

  if (backdrop) {
    backdrop.onclick = () => {
      sidebarHost.classList.add("collapsed");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
      backdrop.classList.remove("visible");
    };
  }

  // Ensure default state: OPEN on initial load
  sidebarHost.classList.remove("collapsed");
  if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
}

function renderSidebarContent({ openView, openLab }) {
  const isMobile = () => window.innerWidth <= 900;
  const closeIfMobile = () => {
    if (isMobile()) {
      sidebarHost?.classList.add("collapsed");
      const toggleBtn = document.getElementById("sidebarToggleBtn");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
      const backdrop = document.getElementById("sidebarBackdrop");
      if (backdrop) backdrop.classList.remove("visible");
    }
  };

  sidebarHost.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-title-row">
        <div>
          <div class="sidebar-sub">Syllabus &amp; Curriculum</div>
          <h2 class="sidebar-heading">Textbook Index</h2>
        </div>
        <button type="button" class="sidebar-close-btn" id="sidebarCloseBtn" aria-label="Close sidebar" title="Close sidebar">&times;</button>
      </div>
      <div class="sidebar-meta-row">
        <span class="sidebar-meta-badge">16 Chapters</span>
        <span class="sidebar-meta-badge live">12 Interactive Labs</span>
      </div>
      <div class="sidebar-filter-wrap">
        <input type="search" class="sidebar-filter-input" id="sidebarFilterInput" placeholder="Filter chapters or topics..." aria-label="Filter chapters or topics" />
      </div>
    </div>

    <div class="sidebar-scroll" id="sidebarScroll">
      <!-- Section: Core Views -->
      <div class="sidebar-section">
        <div class="sidebar-section-title">Workspace Views</div>
        <div class="sidebar-nav-list" role="tablist">
          <button type="button" class="sidebar-nav-btn ${currentActiveView === 'overview' ? 'active' : ''}" data-sidebar-view="overview">
            <span class="sidebar-nav-code">00</span>
            <span class="sidebar-nav-label">Overview &amp; Specimens</span>
          </button>
          <button type="button" class="sidebar-nav-btn ${currentActiveView === 'labs' ? 'active' : ''}" data-sidebar-view="labs">
            <span class="sidebar-nav-code">LAB</span>
            <span class="sidebar-nav-label">Physics Labs (12 Modules)</span>
          </button>
          <button type="button" class="sidebar-nav-btn ${currentActiveView === '01' ? 'active' : ''}" data-sidebar-view="01">
            <span class="sidebar-nav-code">AI</span>
            <span class="sidebar-nav-label">AI Tutor &amp; Derivations</span>
          </button>
          <button type="button" class="sidebar-nav-btn ${currentActiveView === '05' ? 'active' : ''}" data-sidebar-view="05">
            <span class="sidebar-nav-code">QUIZ</span>
            <span class="sidebar-nav-label">12-Twist Concept Quiz</span>
          </button>
        </div>
      </div>

      <!-- Section: Interactive Physics Labs -->
      <div class="sidebar-section">
        <div class="sidebar-section-title">Interactive Labs (12)</div>
        <div class="sidebar-lab-catalog">
          ${renderLabCatalogItems()}
        </div>
      </div>

      <!-- Section: 16-Chapter Textbook Curriculum Tree -->
      <div class="sidebar-section">
        <div class="sidebar-section-title">Textbook Syllabus (Som, Biswas &amp; Chakraborty)</div>
        <div class="sidebar-chapter-tree" id="sidebarChapterTree">
          ${renderCurriculumTree()}
        </div>
      </div>
    </div>
  `;

  // Bind close button
  const closeBtn = document.getElementById("sidebarCloseBtn");
  if (closeBtn) {
    closeBtn.onclick = () => {
      sidebarHost?.classList.add("collapsed");
      const toggleBtn = document.getElementById("sidebarToggleBtn");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
      const backdrop = document.getElementById("sidebarBackdrop");
      if (backdrop) backdrop.classList.remove("visible");
    };
  }

  // Bind view switcher
  sidebarHost.querySelectorAll("[data-sidebar-view]").forEach((btn) => {
    btn.onclick = () => {
      const view = btn.dataset.sidebarView;
      openView(view);
      closeIfMobile();
    };
  });

  // Bind direct lab launch buttons
  sidebarHost.querySelectorAll("[data-launch-bay]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const bay = btn.dataset.launchBay;
      const sub = btn.dataset.launchSub;
      openLab(bay, sub);
      closeIfMobile();
    };
  });

  // Bind chapter accordion toggles
  sidebarHost.querySelectorAll(".chapter-accordion-header").forEach((btn) => {
    btn.onclick = () => {
      const parent = btn.closest(".chapter-tree-node");
      if (!parent) return;
      const wasOpen = parent.classList.contains("is-open");
      parent.classList.toggle("is-open", !wasOpen);
      btn.setAttribute("aria-expanded", String(!wasOpen));
    };
  });

  // Bind filter input
  const filterInput = document.getElementById("sidebarFilterInput");
  if (filterInput) {
    filterInput.oninput = (e) => {
      const query = (e.target.value || "").trim().toLowerCase();
      applyFilter(query);
    };
  }
}

function renderLabCatalogItems() {
  const groups = [
    { title: "Kinematics & Vortex", items: ["2A", "2B", "2C", "2D"] },
    { title: "Viscous & Boundary Layer", items: ["3A", "3B", "3C", "3D"] },
    { title: "Conservation & LBM", items: ["4A", "4B", "4C", "4D"] },
  ];

  return groups.map((g) => `
    <div class="sidebar-lab-group">
      <div class="sidebar-lab-group-title">${g.title}</div>
      <div class="sidebar-lab-pills">
        ${g.items.map((code) => {
          const item = LAB_CATALOG.find((l) => l.code === code);
          if (!item) return "";
          return `
            <button type="button" class="sidebar-lab-pill" data-launch-bay="${item.bay}" data-launch-sub="${item.sub}" title="${item.code} · ${item.title}">
              <span class="pill-code">${item.code}</span>
              <span class="pill-title">${item.title}</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `).join("");
}

function renderCurriculumTree() {
  return TEXTBOOK_CURRICULUM.map((ch, idx) => {
    const hasActiveLabs = ch.status === "active";
    const labCount = ch.labs ? ch.labs.length : 0;
    // Default open chapter 1 and 2 for immediate visibility
    const defaultOpen = idx < 2 ? "is-open" : "";

    return `
      <div class="chapter-tree-node ${defaultOpen}" data-chapter-num="${ch.chapter}">
        <button type="button" class="chapter-accordion-header" aria-expanded="${defaultOpen ? 'true' : 'false'}">
          <span class="chapter-node-left">
            <span class="chapter-num-badge">${String(ch.chapter).padStart(2, '0')}</span>
            <span class="chapter-node-title">${ch.title}</span>
          </span>
          <span class="chapter-node-right">
            ${hasActiveLabs ? `<span class="chapter-status-pill active-lab">${labCount} Lab${labCount > 1 ? 's' : ''}</span>` : `<span class="chapter-status-pill textbook">Theory</span>`}
            <svg class="chapter-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </button>

        <div class="chapter-accordion-body">
          <div class="chapter-sections-list">
            ${ch.sections.map((sec) => `
              <div class="curriculum-section-item">
                <div class="section-item-header">
                  <span class="section-num">${sec.num}</span>
                  <span class="section-title">${sec.title}</span>
                </div>
                ${sec.labs && sec.labs.length ? `
                  <div class="section-active-labs">
                    ${sec.labs.map((l) => `
                      <button type="button" class="section-launch-lab-btn" data-launch-bay="${l.bay}" data-launch-sub="${l.sub}">
                        <span class="btn-tag">${l.code}</span>
                        <span class="btn-name">${l.title}</span>
                        <span class="btn-arrow">&rarr;</span>
                      </button>
                    `).join("")}
                  </div>
                ` : ""}
                <ul class="section-subtopics-list">
                  ${sec.subtopics.map((st) => `<li class="subtopic-bullet">${st}</li>`).join("")}
                </ul>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function applyFilter(query) {
  if (!sidebarHost) return;
  const nodes = sidebarHost.querySelectorAll(".chapter-tree-node");

  if (!query) {
    nodes.forEach((n, idx) => {
      n.style.display = "";
      // Revert to default open state
      n.classList.toggle("is-open", idx < 2);
      const btn = n.querySelector(".chapter-accordion-header");
      if (btn) btn.setAttribute("aria-expanded", String(idx < 2));
    });
    return;
  }

  nodes.forEach((n) => {
    const text = n.textContent.toLowerCase();
    const match = text.includes(query);
    n.style.display = match ? "" : "none";
    if (match) {
      n.classList.add("is-open");
      const btn = n.querySelector(".chapter-accordion-header");
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
  });
}

/**
 * Called when active view changes in app.js so sidebar nav highlight updates.
 */
export function syncActiveSidebarView(view) {
  currentActiveView = view;
  if (!sidebarHost) return;
  sidebarHost.querySelectorAll("[data-sidebar-view]").forEach((btn) => {
    const isTarget = btn.dataset.sidebarView === view;
    btn.classList.toggle("active", isTarget);
  });
}
