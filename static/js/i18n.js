/* Language switcher — persists in localStorage, drives the ask widget's lang
   param and the voice endpoint. UI copy stays English (site chrome); only the
   assistant's question/answer/voice are language-matched, per the brief.

   RWLang.onChange(cb) is the ONE canonical way for page code to react to a
   language switch — never attach a second independent click listener to the
   .rw-lang-pill buttons. Real bug found live (GM revision, 27 Aug 2026): a
   page attaching its own click listener (e.g. to re-render suggestions) ran
   BEFORE this module's own listener fired on the same click, so the page
   read the PREVIOUS language for one click every time — the visible active
   pill and localStorage were already correct, only page-rendered content
   lagged one click behind. onChange() fires only after state is fully
   updated, so there is no listener-order race to get wrong. */
(function () {
  const LANGS = ["en", "zh", "ja", "fr"];
  const subscribers = [];

  function getLang() {
    const l = localStorage.getItem("rw_lang");
    return LANGS.includes(l) ? l : "en";
  }

  function setLang(l) {
    if (!LANGS.includes(l)) return;
    localStorage.setItem("rw_lang", l);
    document.querySelectorAll(".rw-lang-pill").forEach((btn) => {
      btn.classList.toggle("rw-active", btn.dataset.lang === l);
      btn.style.background = btn.dataset.lang === l ? "rgba(255,255,255,0.25)" : "transparent";
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

  function wireLangPills() {
    document.querySelectorAll(".rw-lang-pill").forEach((btn) => {
      // idempotent — safe to call more than once on the same page
      if (btn.dataset.rwLangWired) return;
      btn.dataset.rwLangWired = "1";
      btn.addEventListener("click", () => setLang(btn.dataset.lang));
    });
    setLang(getLang());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireLangPills);
  } else {
    wireLangPills();
  }

  window.RWLang = { getLang, setLang, onChange, wireLangPills, LANGS };
})();
