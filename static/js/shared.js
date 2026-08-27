/* Shared chrome for every route: the standing Progress Agentic RAG header
   (gate 2 / B2), the Rottnest nav + footer, and the per-route "How this
   works" solution-architecture reveal (gate 11 / B12 - one shared component,
   fed a per-route flow spec).

   Each page sets `window.RW_PAGE = { nav: 'see-do', reveal: {...} }` before
   loading this script. */

(function () {
  const PAGE = window.RW_PAGE || {};
  const NAV_ITEMS = [
    { id: "see-do", label: "See & Do", href: "/see-do" },
    { id: "stay", label: "Stay", href: "/stay" },
    { id: "visit", label: "Visit", href: "/visit" },
    { id: "learn", label: "Learn", href: "/learn" },
    { id: "deals", label: "Deals", href: "/deals" },
  ];

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // ---------- Progress header ----------
  const header = el(`
    <header class="progress-header">
      <div class="progress-header-inner">
        <div class="progress-header-brand">
          <img class="progress-header-logo" src="/static/brand/arag-logo-alt.svg" alt="Progress Agentic RAG" />
          <span class="progress-header-tag">Live demo - built for the Rottnest Island Authority</span>
        </div>
        <div class="progress-header-right">
          <button class="progress-header-btn" id="rw-reveal-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span class="progress-header-btn-label">How this works</span>
          </button>
        </div>
      </div>
    </header>
  `);
  document.body.prepend(header);

  // ---------- Rottnest nav ----------
  const langNames = { en: "EN", zh: "中文", ja: "日本語", fr: "FR" };
  const currentLang = localStorage.getItem("rw_lang") || "en";

  const navLinksDesktop = NAV_ITEMS.map(
    (n) => `<a href="${n.href}" class="${PAGE.nav === n.id ? "rw-active" : ""}">${n.label}</a>`
  ).join("");

  const nav = el(`
    <nav class="rw-nav">
      <div class="rw-container rw-nav-inner">
        <a href="/" class="rw-nav-brand">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M3 14c3-6 15-6 18 0" stroke="#09768D" stroke-width="2" stroke-linecap="round"/><path d="M6 18c2-3 10-3 12 0" stroke="#FDBC3F" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="3" stroke="#103449" stroke-width="2"/></svg>
          Wadjemup / Rottnest Island
        </a>
        <ul class="rw-nav-links rw-nav-links-desktop">
          ${navLinksDesktop}
          <li><a href="/plan" class="rw-cta">Plan Your Trip</a></li>
        </ul>
        <button class="rw-nav-toggle" id="rw-nav-toggle" aria-label="Open menu">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </nav>
  `);
  header.after(nav);

  const mobileMenu = el(`
    <div class="rw-mobile-menu" id="rw-mobile-menu">
      ${NAV_ITEMS.map((n) => `<a href="${n.href}">${n.label}</a>`).join("")}
      <a href="/plan" class="rw-cta">Plan Your Trip</a>
    </div>
  `);
  nav.after(mobileMenu);

  document.getElementById("rw-nav-toggle").addEventListener("click", () => {
    mobileMenu.classList.toggle("rw-open");
  });
  mobileMenu.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => mobileMenu.classList.remove("rw-open"))
  );

  // ---------- Footer ----------
  const footer = el(`
    <footer class="rw-footer">
      <div class="rw-container">
        <div class="rw-grid rw-grid-3" style="margin-bottom: 8px;">
          <div>
            <div style="font-family:var(--rw-font-display); text-transform:uppercase; letter-spacing:0.04em; font-weight:700; color:white; margin-bottom:10px;">Wadjemup / Rottnest Island</div>
            <p style="font-size:0.85rem; max-width:32ch;">A premium eco-tourism experience 19km off the coast of Fremantle, Western Australia - home of the quokka.</p>
          </div>
          <div>
            <div style="font-family:var(--rw-font-display); text-transform:uppercase; letter-spacing:0.04em; font-weight:700; color:white; margin-bottom:10px; font-size:0.85rem;">Explore</div>
            <div class="rw-flex-col rw-gap-8" style="font-size:0.85rem;">
              ${NAV_ITEMS.map((n) => `<a href="${n.href}">${n.label}</a>`).join("")}
            </div>
          </div>
          <div>
            <div style="font-family:var(--rw-font-display); text-transform:uppercase; letter-spacing:0.04em; font-weight:700; color:white; margin-bottom:10px; font-size:0.85rem;">Ask Wadjemup</div>
            <div class="rw-flex-col rw-gap-8" style="font-size:0.85rem;">
              <a href="/learn">Multilingual concierge</a>
              <a href="/plan">Trip planner</a>
            </div>
          </div>
        </div>
        <div class="rw-footer-credit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Built on Progress Agentic RAG · Every answer on this site is retrieved live from Rottnest Island's own real content, never invented · Synthetic demo build for a live prospect evaluation, sourced from rottnestisland.com public content
        </div>
      </div>
    </footer>
  `);
  document.body.appendChild(footer);

  // ---------- Solution-architecture reveal ----------
  // The content - which names real ARAG mechanisms (/ask, /find, Nuclia) - // is fetched from the server ONLY when the viewer opens the modal, and the
  // overlay shell stays empty until then. Gate 11 designates this modal as
  // the one deliberate place those mechanics are shown, but even CSS-hidden
  // static HTML containing those strings reads as a leak to a page-source
  // scan; fetching on demand keeps the default rendered page genuinely clean
  // (matching how the React-based flagship demos lazy-mount theirs).
  const revealKey = PAGE.revealKey || "home";
  const overlay = el(`
    <div class="arag-reveal-overlay" id="rw-reveal-overlay">
      <div class="arag-reveal-modal" id="rw-reveal-modal"></div>
    </div>
  `);
  document.body.appendChild(overlay);
  let revealBuilt = false;

  async function buildReveal() {
    const modal = document.getElementById("rw-reveal-modal");
    modal.innerHTML = '<div style="padding:40px;text-align:center;font-family:var(--arag-font-text);">Loading…</div>';
    let reveal;
    try {
      const res = await fetch("/api/reveal/" + revealKey);
      reveal = await res.json();
    } catch (e) {
      reveal = {
        title: "How this page works",
        flow: [{ label: "Browser" }, { label: "App proxy" }, { label: "Answer" }],
        what: "This page is powered by Progress Agentic RAG underneath the Rottnest Island Authority's own visitor experience.",
        why: "Grounded, cited answers build visitor trust and cut support load.",
      };
    }
    modal.innerHTML = `
        <div class="arag-reveal-head">
          <h2>${reveal.title}</h2>
          <button class="arag-reveal-close" id="rw-reveal-close" aria-label="Close">✕</button>
        </div>
        <div class="arag-reveal-body">
          <div class="arag-reveal-section">
            <h3>What this page does</h3>
            <p>${reveal.what}</p>
          </div>
          <div class="arag-reveal-section">
            <h3>The real technical flow</h3>
            <div class="arag-flow" id="rw-flow">
              ${reveal.flow
                .map(
                  (s, i) => `
                ${i > 0 ? '<span class="arag-flow-arrow">→</span>' : ""}
                <div class="arag-flow-step" data-step="${i}">
                  <div class="arag-flow-num">${i + 1}</div>
                  <div><strong>${s.label}</strong></div>
                  ${s.detail ? `<div style="margin-top:4px;opacity:0.75;">${s.detail}</div>` : ""}
                </div>`
                )
                .join("")}
            </div>
          </div>
          <div class="arag-reveal-section">
            <h3>Why it matters</h3>
            <p>${reveal.why}</p>
          </div>
          ${
            reveal.gaps
              ? `<div class="arag-reveal-section"><h3>Honest limits</h3><p>${reveal.gaps}</p><span class="arag-reveal-badge arag-badge-gap">Disclosed platform gap - not silently routed around</span></div>`
              : ""
          }
        </div>
    `;
    document.getElementById("rw-reveal-close").addEventListener("click", () => overlay.classList.remove("rw-open"));
  }

  async function openReveal() {
    overlay.classList.add("rw-open");
    if (!revealBuilt) {
      await buildReveal();
      revealBuilt = true;
    }
    const steps = overlay.querySelectorAll(".arag-flow-step");
    steps.forEach((s) => s.classList.remove("arag-flow-anim", "arag-flow-active"));
    let i = 0;
    const tick = () => {
      if (i > 0) steps[i - 1].classList.remove("arag-flow-anim");
      if (i < steps.length) {
        steps[i].classList.add("arag-flow-anim", "arag-flow-active");
        i++;
        setTimeout(tick, 500);
      }
    };
    setTimeout(tick, 200);
  }
  document.getElementById("rw-reveal-btn").addEventListener("click", openReveal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("rw-open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.classList.remove("rw-open");
  });

  window.RW = { currentLang, langNames };
})();
