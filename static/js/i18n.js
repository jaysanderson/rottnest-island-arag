/* Language switcher — persists in localStorage, drives the ask widget's lang
   param and the voice endpoint. UI copy stays English (site chrome); only the
   assistant's question/answer/voice, and the concierge's own name, are
   language-matched, per the brief.

   A single clean DROPDOWN (GM revision, 27 Aug 2026 — replacing the earlier
   chip row) is the one UI for switching the assistant's language everywhere
   it appears (chat widget, Home, Learn) — build it with RWLang.mountDropdown(),
   never a bespoke chip row per page, so there is exactly one switching
   pattern to get right instead of several to keep in sync.

   RWLang.onChange(cb) is the ONE canonical way for page code to react to a
   language switch. Real bug found live (GM revision, 27 Aug 2026, on the old
   chip UI): a page attaching its own click listener ran BEFORE this module's
   own listener fired on the same click, so the page read the PREVIOUS
   language for one click every time. onChange() fires only after state is
   fully updated, so there is no listener-order race to get wrong — the
   dropdown's own single `change` event keeps this even simpler. */
(function () {
  const LANGS = ["en", "zh", "ja", "fr"];
  const LANG_LABELS = { en: "English", zh: "中文 Mandarin", ja: "日本語 Japanese", fr: "Français" };
  // The concierge's own name, per language — EN is "Kwoka", the real Noongar
  // word for quokka (KB-verified: multiple real Rottnest guide pages use
  // "kwoka (quokka)" in running text), not an invented mascot name. The
  // others are warm, natural pet-style names in each language rather than a
  // literal translation of "Kwoka".
  const QUOKKA_NAMES = { en: "Kwoka", zh: "跳跳", ja: "クオちゃん", fr: "Coco" };

  const subscribers = [];

  function getLang() {
    const l = localStorage.getItem("rw_lang");
    return LANGS.includes(l) ? l : "en";
  }

  function getConciergeName(lang) {
    return QUOKKA_NAMES[lang] || QUOKKA_NAMES.en;
  }

  const dropdowns = [];

  function setLang(l) {
    if (!LANGS.includes(l)) return;
    localStorage.setItem("rw_lang", l);
    dropdowns.forEach((sel) => {
      if (sel.value !== l) sel.value = l;
    });
    subscribers.forEach((cb) => {
      try {
        cb(l);
      } catch (e) {
        console.error("RWLang subscriber error", e);
      }
    });
  }

  function onChange(cb) {
    subscribers.push(cb);
  }

  /* Mounts a <select> language dropdown into `container` (an existing
     element — its innerHTML is replaced) styled with `selectClass`. Returns
     nothing; wire everything through RWLang.getLang()/onChange(). */
  function mountDropdown(container, selectClass) {
    if (!container) return;
    const select = document.createElement("select");
    select.className = selectClass || "rw-lang-select";
    select.setAttribute("aria-label", "Choose a language");
    LANGS.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = LANG_LABELS[l];
      select.appendChild(opt);
    });
    select.value = getLang();
    select.addEventListener("change", () => setLang(select.value));
    dropdowns.push(select);
    container.innerHTML = "";
    container.appendChild(select);
  }

  window.RWLang = { getLang, setLang, onChange, mountDropdown, getConciergeName, LANGS, LANG_LABELS, QUOKKA_NAMES };
})();
