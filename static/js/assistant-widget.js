/* Shared grounded-ask widget: full-width answer, source tiles laid out
   ACROSS the page (B24 — never a narrow column beside a tall source rail). */
(function () {
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Minimal, safe markdown -> HTML (bold, italics, paragraphs, links) — real
  // rendering, never raw markdown syntax on screen (gate 8).
  function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const paras = html.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`);
    return paras.join("");
  }

  function renderSources(citations) {
    if (!citations || !citations.length) return "";
    const tiles = citations
      .map(
        (c, i) => `
      <a class="rw-source-tile" href="/r/${c.resource_id}?p=${encodeURIComponent(c.paragraph_id || "")}">
        <span class="rw-source-num">${i + 1}</span>
        <div class="rw-source-title">${escapeHtml(c.title)}</div>
      </a>`
      )
      .join("");
    return `<div class="rw-sources-row">${tiles}</div>`;
  }

  async function ask(query, lang) {
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, lang: lang || "en" }),
    });
    if (!res.ok) throw new Error("ask failed");
    return res.json();
  }

  function wire(inputSel, buttonSel, outputSel, opts) {
    opts = opts || {};
    const input = document.querySelector(inputSel);
    const button = document.querySelector(buttonSel);
    const output = document.querySelector(outputSel);
    if (!input || !button || !output) return;

    async function go() {
      const q = input.value.trim();
      if (!q) return;
      const lang = opts.getLang ? opts.getLang() : "en";
      output.innerHTML = `<div class="rw-answer-panel"><div class="rw-skeleton" style="height:18px;width:80%;margin-bottom:10px;"></div><div class="rw-skeleton" style="height:18px;width:60%;"></div></div>`;
      button.disabled = true;
      try {
        const data = await ask(q, lang);
        const answerHtml = renderMarkdown(data.answer || "The concierge couldn't form an answer just then — try rephrasing.");
        output.innerHTML = `
          <div class="rw-answer-panel">
            <div class="rw-answer-text">${answerHtml}</div>
            ${renderSources(data.citations)}
            ${opts.voice ? '<button class="rw-btn rw-btn-outline rw-btn-sm rw-mt-16" id="rw-voice-play">🔊 Listen</button><audio id="rw-voice-audio" style="display:none;"></audio>' : ""}
          </div>`;
        if (opts.voice) {
          const playBtn = output.querySelector("#rw-voice-play");
          const audioEl = output.querySelector("#rw-voice-audio");
          playBtn.addEventListener("click", async () => {
            playBtn.textContent = "Loading…";
            playBtn.disabled = true;
            try {
              const vr = await fetch("/api/voice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: data.answer, lang }),
              });
              const blob = await vr.blob();
              audioEl.src = URL.createObjectURL(blob);
              audioEl.play();
              playBtn.textContent = "🔊 Playing…";
            } catch (e) {
              playBtn.textContent = "Voice unavailable";
            } finally {
              playBtn.disabled = false;
            }
          });
        }
      } catch (e) {
        output.innerHTML = `<div class="rw-answer-panel"><p class="rw-body-text">Something went wrong reaching the concierge. Please try again.</p></div>`;
      } finally {
        button.disabled = false;
      }
    }

    button.addEventListener("click", go);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  }

  window.RWAsk = { ask, wire, renderMarkdown, renderSources };
})();
