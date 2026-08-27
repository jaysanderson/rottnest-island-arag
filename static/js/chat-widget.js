/* Persistent conversational chat widget - present on every page (GM revision,
   27 Aug 2026). Genuinely multi-turn: the running transcript is threaded as
   ARAG's own /ask `context` field (see app.py's AskRequest.history), so a
   follow-up like "is it open then" or "how do I get there" resolves against
   what was already said, not answered in isolation. Multilingual via a
   single dropdown (RWLang.mountDropdown - retiring the old chip row's
   listener-order race entirely), grounded + cited + honest decline (same
   /api/assistant endpoint every other ask surface uses), and voice is ONE
   TAP per answer - not buried, per the GM's "Jay couldn't find it" feedback.

   The concierge has a face and a name: Kwoka (EN - the real Noongar word
   for quokka, KB-verified) / 跳跳 (ZH) / クオちゃん (JA) / Coco (FR), a
   quokka avatar in the site's own line-art style, changing with the
   language dropdown (GM revision, 27 Aug 2026).

   State (history + open/closed) persists in sessionStorage so the
   conversation survives navigating between pages within a visit. */
(function () {
  const HISTORY_KEY = "rw_chat_history";
  const OPEN_KEY = "rw_chat_open";
  const AUTOREAD_KEY = "rw_chat_autoread";
  const MAX_HISTORY = 12;

  // Starter follow-up questions shown before any real conversation exists
  // (can't call /api/suggestions yet - no history to ground it in). Real,
  // AI-generated suggestions take over from the first answer onward.
  const STARTER_QUESTIONS = {
    en: ["Where can I see quokkas?", "What's the best beach for snorkelling?", "How do I get to the island?"],
    zh: ["在哪里可以看到短尾矮袋鼠？", "哪个海滩最适合浮潜？", "怎样才能到岛上？"],
    ja: ["クオッカはどこで見られますか？", "シュノーケリングに最適なビーチはどこですか？", "島へはどうやって行きますか？"],
    fr: ["Où puis-je voir des quokkas ?", "Quelle est la meilleure plage pour faire du snorkeling ?", "Comment se rendre sur l'île ?"],
  };

  // A friendly, on-brand line-art quokka face - same teal/navy/gold
  // linework as the rest of the site's decorative motifs, not clip-art.
  // Badge version (own circular backdrop) for the navy chat header;
  // face-only version (transparent) for sitting on the already-gold FAB.
  const QUOKKA_FACE = `
      <ellipse cx="20" cy="16" rx="7" ry="10" transform="rotate(-18 20 16)" fill="#FFF5E2" stroke="#103449" stroke-width="2"/>
      <ellipse cx="44" cy="16" rx="7" ry="10" transform="rotate(18 44 16)" fill="#FFF5E2" stroke="#103449" stroke-width="2"/>
      <ellipse cx="32" cy="36" rx="19" ry="17" fill="#FFF5E2" stroke="#103449" stroke-width="2.2"/>
      <circle cx="25" cy="33" r="2.6" fill="#103449"/>
      <circle cx="39" cy="33" r="2.6" fill="#103449"/>
      <ellipse cx="32" cy="41" rx="3.4" ry="2.4" fill="#103449"/>
      <path d="M27 46 Q32 50 37 46" stroke="#103449" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M14 34 Q9 33 8 30" stroke="#103449" stroke-width="1.4" stroke-linecap="round" fill="none"/>
      <path d="M50 34 Q55 33 56 30" stroke="#103449" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
  const QUOKKA_AVATAR_SVG = `<svg viewBox="0 0 64 64" width="34" height="34" fill="none"><circle cx="32" cy="32" r="32" fill="#FDBC3F"/>${QUOKKA_FACE}</svg>`;
  const QUOKKA_FACE_ONLY_SVG = `<svg viewBox="0 0 64 64" width="30" height="30" fill="none">${QUOKKA_FACE}</svg>`;

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
    <button id="rw-chat-fab" aria-label="Ask the concierge" type="button">
      <span class="rw-chat-fab-avatar">${QUOKKA_FACE_ONLY_SVG}</span>
      <span id="rw-chat-fab-label">Ask Kwoka</span>
    </button>
  `);

  const panel = el(`
    <div id="rw-chat-panel" class="rw-chat-panel" role="dialog" aria-label="Chat with the Wadjemup concierge">
      <div class="rw-chat-head">
        <div class="rw-chat-head-title">
          <span class="rw-chat-avatar">${QUOKKA_AVATAR_SVG}</span>
          <span>
            <span class="rw-chat-dot"></span>
            <span id="rw-chat-name">Kwoka</span>
          </span>
        </div>
        <div class="rw-chat-head-actions">
          <div id="rw-chat-lang-mount"></div>
          <button id="rw-chat-listen-toggle" class="rw-chat-icon-btn" title="Auto-read answers aloud" type="button" aria-pressed="false">🔊</button>
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
  const sharedAudio = new Audio();

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

  // Welcome copy per language - a short, warm greeting in the visitor's own
  // language, not an English sentence with a foreign name spliced in (real
  // bug found live, 27 Aug 2026: switching to French before asking anything
  // still showed "G'day! I'm Coco" in English).
  const WELCOME = {
    en: {
      greeting: (name) => `G'day! I'm ${name}`,
      body: " - ask me anything about Wadjemup: beaches, quokkas, the ferry, history, where to stay. I only ever answer from the island's own real information, and I'll tell you straight if I don't know something.",
      sub: "Switch language up top any time - I'll answer natively and my name changes too.",
    },
    zh: {
      greeting: (name) => `你好！我是 ${name}`,
      body: " - 关于Wadjemup的一切都可以问我：海滩、短尾矮袋鼠、渡轮、历史、住宿。我只会根据岛上真实的资料回答，如果我不知道，我会如实告诉你。",
      sub: "随时可以切换语言 - 我会用当地语言回答，我的名字也会跟着变。",
    },
    ja: {
      greeting: (name) => `こんにちは！${name}です`,
      body: " - ワジェマップについて何でも聞いてください：ビーチ、クオッカ、フェリー、歴史、宿泊先。島の本当の情報だけをもとにお答えします。分からないことは正直にお伝えします。",
      sub: "いつでも言語を切り替えられます - その言語でお答えし、名前も変わります。",
    },
    fr: {
      greeting: (name) => `Bonjour ! Je suis ${name}`,
      body: " - posez-moi vos questions sur Wadjemup : plages, quokkas, ferry, histoire, hébergement. Je réponds uniquement à partir des vraies informations de l'île, et je vous le dirai honnêtement si je ne sais pas.",
      sub: "Changez de langue à tout moment en haut - je répondrai nativement et mon nom changera aussi.",
    },
  };

  function updateConciergeChrome() {
    const name = RWLang.getConciergeName(RWLang.getLang());
    document.getElementById("rw-chat-name").textContent = name;
    document.getElementById("rw-chat-fab-label").textContent = "Ask " + name;
    panel.setAttribute("aria-label", "Chat with " + name + ", the Wadjemup concierge");
  }

  // Genuine user-triggered language SWITCH (wired to RWLang.onChange below,
  // which only fires on the dropdown's own `change` event - never on the
  // initial programmatic mount) always restarts the conversation clean in
  // the new language (GM revision, 27 Aug 2026: a stale prior-language
  // welcome message was found sitting above an answer in the new language - // switching language must never leave anything stale behind).
  function onLanguageSwitch() {
    updateConciergeChrome();
    history = [];
    saveHistory(history);
    renderHistory();
  }

  function renderEmptyState() {
    const messages = document.getElementById("rw-chat-messages");
    const lang = RWLang.getLang();
    const name = RWLang.getConciergeName(lang);
    const w = WELCOME[lang] || WELCOME.en;
    const starters = STARTER_QUESTIONS[lang] || STARTER_QUESTIONS.en;
    messages.innerHTML = `
      <div class="rw-chat-welcome">
        <p><strong>${w.greeting(name)}</strong> ${w.body}</p>
        <p class="rw-chat-welcome-sub">${w.sub}</p>
      </div>
      <div class="rw-chat-suggestions" id="rw-chat-suggestions">
        ${starters.map((q) => `<button class="rw-chat-suggestion-chip" type="button">${RWAsk.escapeHtml(q)}</button>`).join("")}
      </div>`;
    wireSuggestionChips();
  }

  function wireSuggestionChips() {
    const wrap = document.getElementById("rw-chat-suggestions");
    if (!wrap) return;
    wrap.querySelectorAll(".rw-chat-suggestion-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("rw-chat-input").value = btn.textContent;
        send();
      });
    });
  }

  async function renderLiveSuggestions() {
    const messages = document.getElementById("rw-chat-messages");
    const existing = document.getElementById("rw-chat-suggestions");
    if (existing) existing.remove();
    const existingLoading = document.getElementById("rw-chat-suggestions-loading");
    if (existingLoading) existingLoading.remove();
    // This is a second, sequential ARAG call (grounded in the answer just
    // given) - a brief skeleton keeps it from reading as "nothing happening"
    // during that gap rather than a silent multi-second wait.
    const loadingEl = el(`<div class="rw-chat-suggestions-loading" id="rw-chat-suggestions-loading"><span class="rw-skeleton" style="height:30px;width:70%;display:block;"></span></div>`);
    messages.appendChild(loadingEl);
    scrollToBottom();
    try {
      const priorTurns = history.map((t) => ({ author: t.author, text: t.text }));
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: priorTurns, lang: RWLang.getLang() }),
      });
      const data = await res.json();
      const questions = data.questions || [];
      loadingEl.remove();
      if (!questions.length) return;
      // Only attach if the conversation hasn't moved on while this was
      // in flight (best-effort, never blocks or races the real answer).
      if (document.getElementById("rw-chat-suggestions")) return;
      const wrap = el(
        `<div class="rw-chat-suggestions" id="rw-chat-suggestions">${questions
          .map((q) => `<button class="rw-chat-suggestion-chip" type="button">${RWAsk.escapeHtml(q)}</button>`)
          .join("")}</div>`
      );
      messages.appendChild(wrap);
      wireSuggestionChips();
      scrollToBottom();
    } catch (e) {
      loadingEl.remove();
      /* best-effort only - a missing suggestion row never blocks the chat */
    }
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
    // Attach voice + source actions for every assistant turn.
    history.forEach((t, i) => {
      if (t.author !== "NUCLIA") return;
      const actionsEl = messages.querySelector(`.rw-chat-actions[data-idx="${i}"]`);
      if (!actionsEl) return;
      renderActions(actionsEl, t);
    });
    scrollToBottom();
  }

  // Sources only - voice is now the persistent header toggle, not a
  // per-message button (GM revision, 27 Aug 2026: "Jay couldn't find it" as
  // a small button under one answer; a clear, always-visible toggle in the
  // header solves discoverability AND makes every subsequent answer play
  // automatically, which is what "Listen" is actually for on a voice hero).
  function renderActions(actionsEl, turn) {
    const citations = turn.citations || [];
    actionsEl.innerHTML = citations.length
      ? `<div class="rw-chat-sources">${citations
          .slice(0, 4)
          .map(
            (c, i) =>
              `<a class="rw-chat-source-chip" href="/r/${c.resource_id}?p=${encodeURIComponent(c.paragraph_id || "")}">${i + 1}. ${(c.title || "").replace(" | Rottnest Island", "")}</a>`
          )
          .join("")}</div>`
      : "";
  }

  // ---------- Persistent Listen (auto-read) toggle ----------
  let autoRead = sessionStorage.getItem(AUTOREAD_KEY) === "1";

  function setAutoRead(on) {
    autoRead = on;
    try {
      sessionStorage.setItem(AUTOREAD_KEY, on ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
    const btn = document.getElementById("rw-chat-listen-toggle");
    btn.classList.toggle("rw-chat-listen-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on ? "Auto-read is ON - every answer plays aloud (tap to turn off)" : "Auto-read answers aloud";
    if (!on) sharedAudio.pause();
  }

  async function playVoice(text) {
    try {
      sharedAudio.pause();
      const vr = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: RWLang.getLang() }),
      });
      if (!vr.ok) throw new Error("voice failed");
      const blob = await vr.blob();
      sharedAudio.src = URL.createObjectURL(blob);
      await sharedAudio.play();
    } catch (e) {
      /* best-effort - a failed auto-read never blocks the chat */
    }
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
      const answerText = data.answer || "I couldn't quite form an answer to that - could you try rephrasing?";
      history.push({ author: "NUCLIA", text: answerText, citations: data.citations || [] });
      saveHistory(history);
      renderHistory();
      renderLiveSuggestions();
      if (autoRead) playVoice(answerText);
    } catch (e) {
      typingEl.remove();
      history.push({ author: "NUCLIA", text: "Ah, something went wrong on my end there - give it another go?", citations: [] });
      saveHistory(history);
      renderHistory();
    } finally {
      sendBtn.disabled = false;
    }
  }

  // Hide the FAB on narrow screens whenever a DIFFERENT input/textarea on the
  // page has focus (real defect found live on mobile /learn, GM revision
  // 27 Aug 2026: the fixed launcher sat directly on top of that page's own
  // "Ask" submit button when the on-screen keyboard was open, blocking the
  // tap). A closed chat launcher never needs to compete with whatever the
  // visitor is actively filling in elsewhere on the page.
  function isNarrowViewport() {
    return window.innerWidth <= 640;
  }
  document.addEventListener(
    "focusin",
    (e) => {
      if (!isNarrowViewport() || isOpen()) return;
      const t = e.target;
      const isChatField = panel.contains(t);
      if ((t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") && !isChatField) {
        fab.classList.add("rw-chat-fab-hidden");
      }
    },
    true
  );
  document.addEventListener(
    "focusout",
    () => {
      setTimeout(() => {
        const active = document.activeElement;
        const stillExternalField =
          active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT") && !panel.contains(active);
        if (!stillExternalField) fab.classList.remove("rw-chat-fab-hidden");
      }, 80);
    },
    true
  );

  // Fade the closed launcher out while the visitor is actively scrolling on
  // a narrow screen, and back in ~400ms after scrolling stops (GM revision,
  // 27 Aug 2026 - the light mitigation requested for the residual /stay
  // catalogue-card overlap: a floating launcher over content mid-scroll is
  // the accepted trade-off every persistent chat widget makes, but it
  // should never sit there at rest once the visitor has stopped).
  let scrollFadeTimer = null;
  window.addEventListener(
    "scroll",
    () => {
      if (!isNarrowViewport() || isOpen()) return;
      fab.classList.add("rw-chat-fab-scrolling");
      clearTimeout(scrollFadeTimer);
      scrollFadeTimer = setTimeout(() => fab.classList.remove("rw-chat-fab-scrolling"), 400);
    },
    { passive: true }
  );

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
  document.getElementById("rw-chat-listen-toggle").addEventListener("click", () => setAutoRead(!autoRead));

  if (window.RWLang) {
    RWLang.mountDropdown(document.getElementById("rw-chat-lang-mount"), "rw-lang-select rw-lang-select-dark rw-chat-lang-select");
    // onLanguageSwitch only fires on the dropdown's own user-triggered
    // `change` event (never on this initial programmatic setup), so it's
    // safe to register before the one-off chrome update below.
    RWLang.onChange(onLanguageSwitch);
    updateConciergeChrome();
  }
  setAutoRead(autoRead);

  renderHistory();
  // Never auto-restore the panel OPEN on a /r/ source-viewer page (GM
  // revision, 27 Aug 2026: on desktop the open panel covered ~50px of the
  // right edge of the highlighted passage box it exists to lead people to).
  // The FAB itself still shows, so the conversation is one tap away.
  const onSourceViewerPage = window.location.pathname.startsWith("/r/");
  if (!onSourceViewerPage && sessionStorage.getItem(OPEN_KEY) === "1") setOpen(true);
})();
