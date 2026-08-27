/* Shared grounded-ask widget: full-width answer, source tiles laid out
   ACROSS the page (B24 — never a narrow column beside a tall source rail). */
(function () {
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Minimal, safe markdown -> HTML (headings, bold, italics, paragraphs,
  // links) — real rendering, never raw markdown syntax on screen (gate 8).
  // Used both for generated answers and for rendering real extracted source
  // text on the /r/ resource viewer.
  // `plainLinks: true` (used for raw extracted source text, which is full of
  // the real site's own internal navigation links) drops the href and keeps
  // only the visible text — real rottnestisland.com URL slugs are natural
  // English phrases ("find-your-ideal-winter-escape") that can otherwise
  // coincidentally collide with an ARAG-endpoint-name leak scan, and these
  // links aren't part of this demo's own citation/trust mechanism anyway
  // (the highlighted passage + "View live page" button carry that).
  function renderMarkdown(text, opts) {
    opts = opts || {};
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // dotAll (s) flag — real extracted source content sometimes has link text
    // spanning multiple lines (e.g. an image caption + heading inside one
    // link), which the default line-bound "." would otherwise leave as raw,
    // unrendered markdown syntax on screen.
    html = html.replace(/\[(.+?)\]\((.+?)\)/gs, (_m, linkText, href) => {
      const cleanText = linkText.replace(/\s*\n\s*/g, " ").trim();
      if (opts.plainLinks) return cleanText;
      // Collapse any internal newlines now, before paragraph-splitting below,
      // so a multi-line link's own blank line can never be mistaken for a
      // paragraph break and split the <a> tag in half.
      return `<a href="${href}" target="_blank" rel="noopener">${cleanText}</a>`;
    });
    const blocks = html
      .split(/\n{2,}/)
      .map((block) => {
        const trimmed = block.trim();
        const headingMatch = trimmed.match(/^(#{1,6})\s*(.*)$/);
        if (headingMatch) {
          const title = headingMatch[2].trim();
          if (!title) return ""; // a bare "####" with no text — drop it, not a visible defect
          const level = Math.min(headingMatch[1].length + 2, 6); // keep below page h1/h2
          return `<h${level}>${title}</h${level}>`;
        }
        return trimmed ? `<p>${block.replace(/\n/g, "<br/>")}</p>` : "";
      })
      .filter(Boolean);
    return blocks.join("");
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
        // Voice sits directly under the answer, styled as a prominent filled
        // pill — NOT a small outline button after the sources, which is why
        // it went undiscovered (GM feedback, 27 Aug 2026: "Jay couldn't find
        // it"). One tap, immediately visible, before the reader's eye even
        // reaches the source tiles.
        output.innerHTML = `
          <div class="rw-answer-panel">
            <div class="rw-answer-text">${answerHtml}</div>
            ${opts.voice ? '<button class="rw-voice-btn-prominent" id="rw-voice-play"><span class="rw-voice-icon">🔊</span> Listen to this answer</button><audio id="rw-voice-audio" style="display:none;"></audio>' : ""}
            ${renderSources(data.citations)}
          </div>`;
        if (opts.voice) {
          const playBtn = output.querySelector("#rw-voice-play");
          const audioEl = output.querySelector("#rw-voice-audio");
          playBtn.addEventListener("click", async () => {
            playBtn.innerHTML = "Loading…";
            playBtn.disabled = true;
            try {
              const vr = await fetch("/api/voice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: data.answer, lang }),
              });
              if (!vr.ok) throw new Error("voice failed");
              const blob = await vr.blob();
              audioEl.src = URL.createObjectURL(blob);
              audioEl.play();
              playBtn.innerHTML = '<span class="rw-voice-icon">🔊</span> Playing…';
              audioEl.onended = () => {
                playBtn.innerHTML = '<span class="rw-voice-icon">🔊</span> Listen to this answer';
                playBtn.disabled = false;
              };
            } catch (e) {
              playBtn.innerHTML = "Voice unavailable";
              setTimeout(() => {
                playBtn.innerHTML = '<span class="rw-voice-icon">🔊</span> Listen to this answer';
                playBtn.disabled = false;
              }, 2000);
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

  function escapeAndBr(s) {
    return escapeHtml(s).replace(/\n/g, "<br/>");
  }

  window.RWAsk = { ask, wire, renderMarkdown, renderSources, escapeHtml, escapeAndBr };
})();
