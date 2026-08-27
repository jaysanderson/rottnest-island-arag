/* Language switcher — persists in localStorage, drives the ask widget's lang
   param and the voice endpoint. UI copy stays English (site chrome); only the
   assistant's question/answer/voice are language-matched, per the brief. */
(function () {
  const LANGS = ["en", "zh", "ja", "fr"];
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
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".rw-lang-pill").forEach((btn) => {
      btn.addEventListener("click", () => setLang(btn.dataset.lang));
    });
    setLang(getLang());
  });
  window.RWLang = { getLang, setLang, LANGS };
})();
