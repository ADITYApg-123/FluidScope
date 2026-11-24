/**
 * App Sidebar & Textbook Curriculum Tree Component for FluidScope AI.
 * Provides independent scrollable navigation drawer with:
 * - Direct view switcher (Overview, Physics Labs, AI Tutor, 12-Twist Quiz)
 * - 12 Active interactive lab direct links
 * - 16-Chapter interactive textbook syllabus tree (Som, Biswas & Chakraborty 3rd Ed.)
 * - Every topic and subtopic is interactive and clickable (opens lab or theory reader)
 */

import { TEXTBOOK_CURRICULUM } from "../core/textbook_curriculum.js";
import { LAB_CATALOG } from "../core/store.js";
import { openTopicModal } from "./topic_modal.js";

let sidebarHost = null;
let currentActiveView = "overview";

export function initAppSidebar({ openView, openLab, openConcept }) {
  sidebarHost = document.getElementById("appSidebar");
  const toggleBtn = document.getElementById("sidebarToggleBtn");
  const backdrop = document.getElementById("sidebarBackdrop");

  if (!sidebarHost) return;

  renderSidebarContent({ openView, openLab, openConcept });

  // Toggle behavior from top bar toggle button
  if (toggleBtn) {
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      const isCollapsed = sidebarHost.classList.toggle("collapsed");
      toggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
      toggleBtn.classList.toggle("active", !isCollapsed);
      if (backdrop) {
        backdrop.classList.toggle("visible", !isCollapsed && window.innerWidth <= 900);
      }
    };
  }

  if (backdrop) {
    backdrop.onclick = () => {
      sidebarHost.classList.add("collapsed");
      if (toggleBtn) {
        toggleBtn.setAttribute("aria-expanded", "false");
        toggleBtn.classList.remove("active");
      }
      backdrop.classList.remove("visible");
    };
  }

  // Ensure default state: OPEN on initial load
  sidebarHost.classList.remove("collapsed");
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-expanded", "true");
    toggleBtn.classList.add("active");
  }
}

function renderSidebarContent({ openView, openLab, openConcept }) {
  const isMobile = () => window.innerWidth <= 900;
  const closeIfMobile = () => {
    if (isMobile()) {
      sidebarHost?.classList.add("collapsed");
      const toggleBtn = document.getElementById("sidebarToggleBtn");
      if (toggleBtn) {
        toggleBtn.setAttribute("aria-expanded", "false");
        toggleBtn.classList.remove("active");
      }
      const backdrop = document.getElementById("sidebarBackdrop");
      if (backdrop) backdrop.classList.remove("visible");
    }
  };

  sidebarHost.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-title-row">
        <div>
          <div class="sidebar-sub">Textbook Syllabus</div>
          <h2 class="sidebar-heading">Curriculum Index</h2>
        </div>
        <button type="button" class="sidebar-collapse-btn" id="sidebarCollapseBtn" title="Collapse sidebar" aria-label="Collapse sidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      </div>
      <div class="sidebar-meta-row">
        <span class="sidebar-meta-badge">16 Chapters</span>
        <span class="sidebar-meta-badge live">12 Active Labs</span>
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

  // Bind sidebar internal collapse button
  const collapseBtn = document.getElementById("sidebarCollapseBtn");
  if (collapseBtn) {
    collapseBtn.onclick = () => {
      sidebarHost?.classList.add("collapsed");
      const toggleBtn = document.getElementById("sidebarToggleBtn");
      if (toggleBtn) {
        toggleBtn.setAttribute("aria-expanded", "false");
        toggleBtn.classList.remove("active");
      }
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

  // Bind direct lab launch buttons from the catalog
  sidebarHost.querySelectorAll("[data-launch-bay]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const bay = btn.dataset.launchBay;
      const sub = btn.dataset.launchSub;
      openLab(bay, sub);
      closeIfMobile();
    };
  });

  // Bind chapter accordion header toggles
  sidebarHost.querySelectorAll(".chapter-accordion-header").forEach((btn) => {
    btn.onclick = () => {
      const parent = btn.closest(".chapter-tree-node");
      if (!parent) return;
      const wasOpen = parent.classList.contains("is-open");
      parent.classList.toggle("is-open", !wasOpen);
      btn.setAttribute("aria-expanded", String(!wasOpen));
    };
  });

  // Bind topic header clicks (interactive!)
  sidebarHost.querySelectorAll(".curriculum-topic-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const chNum = btn.dataset.ch;
      const secNum = btn.dataset.sec;
      const bay = btn.dataset.launchBay;
      const sub = btn.dataset.launchSub;

      if (openConcept?.(chNum, secNum, null)) {
        closeIfMobile();
      } else if (bay && sub) {
        openLab(bay, sub);
        closeIfMobile();
      } else {
        openTopicModal(chNum, secNum);
      }
    };
  });

  // Bind subtopic clicks (interactive!)
  sidebarHost.querySelectorAll(".curriculum-subtopic-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const chNum = btn.dataset.ch;
      const secNum = btn.dataset.sec;
      const text = btn.dataset.subtopic;
      const bay = btn.dataset.launchBay;
      const sub = btn.dataset.launchSub;

      if (openConcept?.(chNum, secNum, text)) {
        closeIfMobile();
      } else if (bay && sub) {
        openLab(bay, sub);
        closeIfMobile();
      } else {
        openTopicModal(chNum, secNum, text);
      }
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
            <span class="chapter-node-title" title="${ch.title}">${ch.title}</span>
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
            ${ch.sections.map((sec) => {
              const labMatch = sec.labs && sec.labs[0];
              const bayAttr = labMatch ? `data-launch-bay="${labMatch.bay}" data-launch-sub="${labMatch.sub}"` : "";

              return `
                <div class="curriculum-section-item">
                  <button type="button" class="curriculum-topic-btn" data-ch="${ch.chapter}" data-sec="${sec.num}" ${bayAttr} title="Click to view ${sec.num} details">
                    <span class="curriculum-topic-num">${sec.num}</span>
                    <span class="curriculum-topic-title">${sec.title}</span>
                    ${labMatch ? `<span class="topic-lab-badge">${labMatch.code}</span>` : `<span class="topic-chevron">&rsaquo;</span>`}
                  </button>

                  <div class="curriculum-subtopics-list">
                    ${sec.subtopics.map((st) => `
                      <button type="button" class="curriculum-subtopic-btn" data-ch="${ch.chapter}" data-sec="${sec.num}" data-subtopic="${st}" ${bayAttr} title="Click to inspect: ${st}">
                        <span class="subtopic-dash">&ndash;</span>
                        <span class="subtopic-label">${st}</span>
                      </button>
                    `).join("")}
                  </div>
                </div>
              `;
            }).join("")}
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

/**
 * Highlights the active topic & subtopic in the sidebar as the user scrolls or clicks.
 */
export function syncActiveSubtopic(chNum, secNum, subtopicLabel) {
  if (!sidebarHost) return;
  sidebarHost.querySelectorAll(".curriculum-topic-btn").forEach((btn) => {
    const match = chNum && secNum && btn.dataset.ch === String(chNum) && btn.dataset.sec === String(secNum);
    btn.classList.toggle("is-active", Boolean(match));
  });
  sidebarHost.querySelectorAll(".curriculum-subtopic-btn").forEach((btn) => {
    const match =
      chNum &&
      secNum &&
      subtopicLabel &&
      btn.dataset.ch === String(chNum) &&
      btn.dataset.sec === String(secNum) &&
      btn.dataset.subtopic === subtopicLabel;
    btn.classList.toggle("is-active", Boolean(match));
  });
}
