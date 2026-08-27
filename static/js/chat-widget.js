/* Persistent conversational chat widget — present on every page (GM revision,
   27 Aug 2026). Genuinely multi-turn: the running transcript is threaded as
   ARAG's own /ask `context` field (see app.py's AskRequest.history), so a
   follow-up like "is it open then" or "how do I get there" resolves against
   what was already said, not answered in isolation. Multilingual (reuses
   RWLang), grounded + cited + honest decline (same /api/assistant endpoint
   every other ask surface uses), and voice is ONE TAP per answer — not
   buried, per the GM's "Jay couldn't find it" feedback.

   State (history + open/closed) persists in sessionStorage so the
   conversation survives navigating between pages within a visit. */
(function () {
  const HISTORY_KEY = "rw_chat_history";
  const OPEN_KEY = "rw_chat_open";
  const MAX_HISTORY = 12;

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveHistory(h) {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY)));
    } catch (e) {
      /* ignore quota errors */
    }
  }

  let history = loadHistory();

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  const fab = el(`
    <button id="rw-chat-fab" aria-label="Ask Wadjemup" type="button">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      <span id="rw-chat-fab-label">Ask Wadjemup</span>
    </button>
  `);

  const panel = el(`
    <div id="rw-chat-panel" class="rw-chat-panel" role="dialog" aria-label="Ask Wadjemup chat">
      <div class="rw-chat-head">
        <div class="rw-chat-head-title">
          <span class="rw-chat-dot"></span>
          Ask Wadjemup
        </div>
        <div class="rw-chat-head-actions">
          <div class="rw-chat-langs" id="rw-chat-langs">
            <button class="rw-lang-pill rw-chat-lang-pill" data-lang="en">EN</button>
            <button class="rw-lang-pill rw-chat-lang-pill" data-lang="zh">中文</button>
            <button class="rw-lang-pill rw-chat-lang-pill" data-lang="ja">日本語</button>
            <button class="rw-lang-pill rw-chat-lang-pill" data-lang="fr">FR</button>
          </div>
          <button id="rw-chat-reset" class="rw-chat-icon-btn" title="Reset conversation" type="button">↺</button>
          <button id="rw-chat-close" class="rw-chat-icon-btn" title="Close" type="button">✕</button>
        </div>
      </div>
      <div class="rw-chat-messages" id="rw-chat-messages"></div>
      <div class="rw-chat-input-row">
        <input id="rw-chat-input" class="rw-input" placeholder="Ask about beaches, quokkas, the ferry, history..." />
        <button id="rw-chat-send" class="rw-btn rw-btn-primary rw-btn-sm" type="button">Send</button>
      </div>
    </div>
  `);

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  function isOpen() {
    return panel.classList.contains("rw-open");
  }

  function setOpen(open) {
    panel.classList.toggle("rw-open", open);
    fab.classList.toggle("rw-chat-fab-open", open);
    try {
      sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
    if (open) {
      document.getElementById("rw-chat-input").focus();
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    const m = document.getElementById("rw-chat-messages");
    m.scrollTop = m.scrollHeight;
  }

  function renderEmptyState() {
    const messages = document.getElementById("rw-chat-messages");
    messages.innerHTML = `
      <div class="rw-chat-welcome">
        <p><strong>Kia ora! Ask me anything about Wadjemup</strong> — beaches, quokkas, the ferry, history, where to stay. I only answer from the island's own real information, and I'll tell you honestly if I don't know.</p>
        <p class="rw-chat-welcome-sub">Switch language above any time — I answer natively in EN, 中文, 日本語 or Français.</p>
      </div>`;
  }

  function bubbleHtml(turn) {
    const isUser = turn.author === "USER";
    const bodyHtml = isUser
      ? (window.RWAsk ? RWAsk.escapeAndBr(turn.text) : turn.text)
      : (window.RWAsk ? RWAsk.renderMarkdown(turn.text) : turn.text);
    return `
      <div class="rw-chat-msg ${isUser ? "rw-chat-msg-user" : "rw-chat-msg-bot"}">
        <div class="rw-chat-bubble">${bodyHtml}</div>
        ${!isUser ? `<div class="rw-chat-actions" data-idx="${turn.idx}"></div>` : ""}
      </div>`;
  }

  function renderHistory() {
    const messages = document.getElementById("rw-chat-messages");
    if (!history.length) {
      renderEmptyState();
      return;
    }
    messages.innerHTML = history.map((t, i) => bubbleHtml({ ...t, idx: i })).join("");
    // Attach voice + source actions for the most recent assistant turn (the
    // one with citations/answer text cached alongside it).
    history.forEach((t, i) => {
      if (t.author !== "NUCLIA") return;
      const actionsEl = messages.querySelector(`.rw-chat-actions[data-idx="${i}"]`);
      if (!actionsEl) return;
      renderActions(actionsEl, t);
    });
    scrollToBottom();
  }

  function renderActions(actionsEl, turn) {
    const citations = turn.citations || [];
    const sourcesHtml = citations.length
      ? `<div class="rw-chat-sources">${citations
          .slice(0, 4)
          .map(
            (c, i) =>
              `<a class="rw-chat-source-chip" href="/r/${c.resource_id}?p=${encodeURIComponent(c.paragraph_id || "")}">${i + 1}. ${(c.title || "").replace(" | Rottnest Island", "")}</a>`
          )
          .join("")}</div>`
      : "";
    actionsEl.innerHTML = `
      <button class="rw-chat-voice-btn" type="button">🔊 Listen</button>
      ${sourcesHtml}
    `;
    const voiceBtn = actionsEl.querySelector(".rw-chat-voice-btn");
    const audioEl = document.createElement("audio");
    audioEl.style.display = "none";
    actionsEl.appendChild(audioEl);
    voiceBtn.addEventListener("click", async () => {
      voiceBtn.textContent = "Loading…";
      voiceBtn.disabled = true;
      try {
        const vr = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: turn.text, lang: RWLang.getLang() }),
        });
        if (!vr.ok) throw new Error("voice failed");
        const blob = await vr.blob();
        audioEl.src = URL.createObjectURL(blob);
        audioEl.play();
        voiceBtn.textContent = "🔊 Playing…";
        audioEl.onended = () => {
          voiceBtn.textContent = "🔊 Listen";
          voiceBtn.disabled = false;
        };
      } catch (e) {
        voiceBtn.textContent = "Voice unavailable";
        setTimeout(() => {
          voiceBtn.textContent = "🔊 Listen";
          voiceBtn.disabled = false;
        }, 2000);
      }
    });
  }

  async function send() {
    const input = document.getElementById("rw-chat-input");
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    const sendBtn = document.getElementById("rw-chat-send");
    sendBtn.disabled = true;

    history.push({ author: "USER", text: q });
    saveHistory(history);
    renderHistory();

    const messages = document.getElementById("rw-chat-messages");
    const typingEl = el(`<div class="rw-chat-msg rw-chat-msg-bot"><div class="rw-chat-bubble rw-chat-typing"><span></span><span></span><span></span></div></div>`);
    messages.appendChild(typingEl);
    scrollToBottom();

    try {
      const priorTurns = history.slice(0, -1).map((t) => ({ author: t.author, text: t.text }));
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, lang: RWLang.getLang(), history: priorTurns }),
      });
      const data = await res.json();
      typingEl.remove();
      const answerText = data.answer || "I couldn't quite form an answer to that — could you try rephrasing?";
      history.push({ author: "NUCLIA", text: answerText, citations: data.citations || [] });
      saveHistory(history);
      renderHistory();
    } catch (e) {
      typingEl.remove();
      history.push({ author: "NUCLIA", text: "Something went wrong reaching the concierge. Please try again.", citations: [] });
      saveHistory(history);
      renderHistory();
    } finally {
      sendBtn.disabled = false;
    }
  }

  document.getElementById("rw-chat-fab").addEventListener("click", () => setOpen(!isOpen()));
  document.getElementById("rw-chat-close").addEventListener("click", () => setOpen(false));
  document.getElementById("rw-chat-reset").addEventListener("click", () => {
    history = [];
    saveHistory(history);
    renderHistory();
  });
  document.getElementById("rw-chat-send").addEventListener("click", send);
  document.getElementById("rw-chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  // Chat's own language pills mirror the global RWLang state exactly — same
  // subscription pattern as every other language-aware surface (i18n.js),
  // no independent click listener that could desync (the exact class of bug
  // just fixed on /learn).
  function syncChatLangPills(lang) {
    panel.querySelectorAll(".rw-chat-lang-pill").forEach((btn) => {
      btn.classList.toggle("rw-active", btn.dataset.lang === lang);
    });
  }
  panel.querySelectorAll(".rw-chat-lang-pill").forEach((btn) => {
    btn.addEventListener("click", () => RWLang.setLang(btn.dataset.lang));
  });
  if (window.RWLang) {
    RWLang.onChange(syncChatLangPills);
    syncChatLangPills(RWLang.getLang());
  }

  renderHistory();
  if (sessionStorage.getItem(OPEN_KEY) === "1") setOpen(true);
})();
