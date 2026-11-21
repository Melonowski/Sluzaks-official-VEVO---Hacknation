(() => {
  if (window.__prawdowidInjected) return;
  window.__prawdowidInjected = true;

  const API_URL = "http://127.0.0.1:8000/api/verify";
  const WEB_APP_URL = "http://localhost:3000";

  let selectMode = false;

  // Kontener główny w Shadow DOM (żeby style Facebooka/X nie rozwaliły naszego UI)
  const host = document.createElement("div");
  host.id = "prawdowid-root";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const profImgUrl = chrome.runtime.getURL("assets/profesorek.png");

  shadow.innerHTML = `
    <style>
      .prof-btn {
        position: fixed;
        bottom: 22px;
        right: 22px;
        width: 68px;
        height: 68px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1e293b, #0f172a);
        border: 2px solid #38bdf8;
        box-shadow: 0 10px 25px rgba(0,0,0,0.45);
        cursor: pointer;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        overflow: hidden;
      }
      .prof-btn:hover { transform: scale(1.08); box-shadow: 0 12px 30px rgba(56, 189, 248, 0.4); }
      .prof-btn img { width: 100%; height: 100%; object-fit: cover; }
      .prof-fallback { font-size: 32px; user-select: none; }

      .backdrop {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(2, 6, 23, 0.72);
        backdrop-filter: blur(2px);
        z-index: 2147483644;
      }
      .backdrop.active { display: block; }

      .banner {
        display: none;
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #38bdf8;
        padding: 12px 22px;
        border-radius: 999px;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        font-weight: 600;
        z-index: 2147483647;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      }
      .banner.active { display: flex; align-items: center; gap: 12px; }
      .banner button {
        background: #334155; color: white; border: none; padding: 4px 10px;
        border-radius: 999px; cursor: pointer; font-size: 12px;
      }

      .card {
        display: none;
        position: fixed;
        bottom: 102px;
        right: 22px;
        width: 390px;
        max-height: 80vh;
        overflow-y: auto;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 18px;
        font-family: system-ui, -apple-system, sans-serif;
        z-index: 2147483647;
        box-shadow: 0 20px 50px rgba(0,0,0,0.7);
      }
      .card.active { display: block; }
      .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
      .badge {
        padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 800; letter-spacing: 0.4px;
      }
      .verdict-POTWIERDZONE { background: #14532d; color: #86efac; border: 1px solid #22c55e; }
      .verdict-FAŁSZYWE { background: #7f1d1d; color: #fca5a5; border: 1px solid #ef4444; }
      .verdict-WPROWADZAJĄCE { background: #78350f; color: #fcd34d; border: 1px solid #f59e0b; }
      .verdict-BRAK { background: #1e293b; color: #94a3b8; border: 1px solid #64748b; }

      .close-x { background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
      .summary { font-size: 13px; line-height: 1.5; color: #e2e8f0; margin-bottom: 12px; }
      .bar-wrap { background: #1e293b; border-radius: 8px; padding: 10px; margin-bottom: 12px; }
      .bar-label { display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 5px; }
      .bar-bg { height: 8px; background: #334155; border-radius: 999px; overflow: hidden; }
      .bar-fill { height: 100%; background: #38bdf8; transition: width 0.4s ease; }

      .source-box {
        background: #1e293b; border-left: 3px solid #38bdf8; padding: 8px 10px;
        border-radius: 6px; margin-bottom: 8px; font-size: 12px;
      }
      .source-box a { color: #38bdf8; text-decoration: none; font-weight: 600; display: block; }
      .source-quote { color: #cbd5e1; font-style: italic; margin-top: 4px; font-size: 11px; }
      .limits { font-size: 11px; color: #94a3b8; margin-top: 8px; border-top: 1px solid #1e293b; padding-top: 8px; }

      .actions { display: flex; gap: 8px; margin-top: 14px; }
      .btn-primary {
        flex: 1; background: #2563eb; color: white; border: none; padding: 10px;
        border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; text-align: center; text-decoration: none;
      }
      .btn-primary:hover { background: #1d4ed8; }
      .alert-sec {
        background: #450a0a; border: 1px solid #ef4444; color: #fecaca;
        padding: 8px; border-radius: 6px; font-size: 11px; margin-bottom: 10px;
      }
    </style>

    <div class="backdrop" id="backdrop"></div>
    <div class="banner" id="banner">
      <span>🔍 Zaznacz myszką tekst posta na stronie, aby Prawdowid go sprawdził...</span>
      <button id="cancelSelect">Anuluj</button>
    </div>

    <div class="card" id="resultCard">
      <div class="header">
        <span style="font-size: 12px; font-weight: 700; color: #38bdf8;">☕ PROFESOREK PRAWDOWID</span>
        <button class="close-x" id="closeCard">✕</button>
      </div>
      <div id="cardBody"></div>
    </div>

    <button class="prof-btn" id="profBtn" title="Kliknij, aby zweryfikować fragment strony">
      <img src="${profImgUrl}" alt="Profesorek" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
      <span class="prof-fallback" style="display:none;">🧐☕</span>
    </button>
  `;

  const profBtn = shadow.getElementById("profBtn");
  const backdrop = shadow.getElementById("backdrop");
  const banner = shadow.getElementById("banner");
  const cancelSelect = shadow.getElementById("cancelSelect");
  const resultCard = shadow.getElementById("resultCard");
  const cardBody = shadow.getElementById("cardBody");
  const closeCard = shadow.getElementById("closeCard");

  // Obsługa włącznika z popupu
  chrome.storage.local.get(["prawdowid_enabled"], (res) => {
    if (res.prawdowid_enabled === false) host.style.display = "none";
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.prawdowid_enabled) {
      host.style.display = changes.prawdowid_enabled.newValue ? "block" : "none";
    }
  });

  function exitSelectMode() {
    selectMode = false;
    backdrop.classList.remove("active");
    banner.classList.remove("active");
    document.body.style.cursor = "default";
  }

  profBtn.addEventListener("click", () => {
    // Jeśli użytkownik już coś zaznaczył przed kliknięciem Profesorka -> sprawdzamy od razu!
    const preSelected = window.getSelection().toString().trim();
    if (preSelected.length >= 10) {
      verifySelectedText(preSelected);
      return;
    }
    selectMode = !selectMode;
    if (selectMode) {
      backdrop.classList.add("active");
      banner.classList.add("active");
      resultCard.classList.remove("active");
      document.body.style.cursor = "text";
    } else {
      exitSelectMode();
    }
  });

  cancelSelect.addEventListener("click", exitSelectMode);
  closeCard.addEventListener("click", () => {
    resultCard.classList.remove("active");
    backdrop.classList.remove("active");
  });

  // Złapanie zaznaczonego tekstu myszką
  document.addEventListener("mouseup", () => {
    if (!selectMode) return;
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length >= 10) {
      exitSelectMode();
      verifySelectedText(selectedText);
    }
  });

  function getVerdictClass(verdict) {
    if (!verdict) return "verdict-BRAK";
    if (verdict.includes("POTWIERDZONE")) return "verdict-POTWIERDZONE";
    if (verdict.includes("FAŁSZYWE")) return "verdict-FAŁSZYWE";
    if (verdict.includes("WPROWADZAJĄCE")) return "verdict-WPROWADZAJĄCE";
    return "verdict-BRAK";
  }

  async function verifySelectedText(text) {
    backdrop.classList.add("active");
    resultCard.classList.add("active");
    cardBody.innerHTML = `
      <div style="padding: 20px 0; text-align: center;">
        <div style="font-size: 28px; margin-bottom: 8px;">☕🧐</div>
        <div style="font-size: 13px; color: #38bdf8; font-weight: 600;">Profesorek sprawdza rejestry urzędowe i bazy fact-checkingowe...</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">"${text.slice(0, 90)}..."</div>
      </div>
    `;

    try {
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_text: text, channel: "extension" })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Błąd połączenia z serwerem Prawdowid.");
      }

      const data = await resp.json();
      const confidencePct = Math.round((data.confidence_score || 0) * 100);
      const vClass = getVerdictClass(data.verdict);

      let sourcesHtml = "";
      const allSources = (data.claims || []).flatMap(c => c.sources || []);
      if (allSources.length > 0) {
        sourcesHtml = allSources.slice(0, 2).map(s => `
          <div class="source-box">
            <a href="${s.url}" target="_blank">${s.title} (${s.date}) ↗</a>
            <div style="font-size: 10px; color: #94a3b8;">${s.publisher}</div>
            <div class="source-quote">"${s.quote}"</div>
          </div>
        `).join("");
      } else {
        sourcesHtml = `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">Brak bezpośrednich cytatów w bazie dla tego fragmentu.</div>`;
      }

      const secHtml = data.security_alert
        ? `<div class="alert-sec">⚠️ ${data.security_alert}</div>`
        : "";

      const fullResultUrl = `${WEB_APP_URL}?session=${encodeURIComponent(data.session_id)}&q=${encodeURIComponent(text)}`;

      cardBody.innerHTML = `
        ${secHtml}
        <div style="margin-bottom: 10px;">
          <span class="badge ${vClass}">${data.verdict}</span>
        </div>
        <div class="summary">${data.summary}</div>

        <div class="bar-wrap">
          <div class="bar-label">
            <span>Siła podstawy dowodowej</span>
            <span><strong>${confidencePct}%</strong></span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill" style="width: ${confidencePct}%;"></div>
          </div>
        </div>

        <div style="font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">ŹRÓDŁA I DOWODY:</div>
        ${sourcesHtml}

        <div class="limits">ℹ️ <strong>Ograniczenia:</strong> ${data.limitations}</div>

        <div class="actions">
          <a class="btn-primary" href="${fullResultUrl}" target="_blank">📊 Otwórz pełną analizę i wykresy na stronie ↗</a>
        </div>
      `;
    } catch (e) {
      cardBody.innerHTML = `
        <div class="alert-sec">
          <strong>Komunikat techniczny (nie jest to werdykt):</strong><br/>
          ${e.message}
        </div>
      `;
    }
  }
})();