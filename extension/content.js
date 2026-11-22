(() => {
  if (window.__prawdowidInjected) return;
  window.__prawdowidInjected = true;

  const extApi = typeof browser !== "undefined" && browser.runtime ? browser : chrome;
  const API_URL = "https://absence-newbie-july-elementary.trycloudflare.com/api/verify";
  const WEB_APP_URL = "https://absence-newbie-july-elementary.trycloudflare.com";

  function clampPct(v) {
    const n = Number(v);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function init() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", init, { once: true });
      return;
    }
    if (document.getElementById("prawdowid-root")) return;

    let selectMode = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentRect = null;
    let lastResult = null;

    const host = document.createElement("div");
    host.id = "prawdowid-root";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    const SPRITES = {
      idle: extApi.runtime.getURL("assets/profesorek.png"),
      thinking: extApi.runtime.getURL("assets/ProfesorekMysli.png"),
      answered: extApi.runtime.getURL("assets/ProfesorekMaOdp.png")
    };

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }

        @keyframes profPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04) translateY(-3px); }
        }

        .prof-btn {
          position: fixed;
          bottom: -8px;
          right: 20px;
          width: 120px;
          height: auto;
          background: transparent;
          border: none;
          padding: 0;
          margin: 0;
          cursor: pointer;
          z-index: 2147483646;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.25s ease;
          filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.75));
        }
        .prof-btn:hover {
          transform: translateY(-6px) scale(1.06);
          filter: drop-shadow(0 14px 24px rgba(220, 38, 38, 0.55));
        }
        .prof-btn.thinking {
          animation: profPulse 1.4s ease-in-out infinite;
          filter: drop-shadow(0 10px 22px rgba(239, 68, 68, 0.7));
        }
        .prof-btn img {
          width: 100%;
          height: auto;
          display: block;
          object-fit: contain;
          pointer-events: none;
        }
        .prof-fallback {
          font-size: 46px;
          user-select: none;
        }

        .backdrop {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(8, 8, 8, 0.78);
          backdrop-filter: blur(2px);
          z-index: 2147483644;
          cursor: crosshair;
          user-select: none;
        }
        .backdrop.active { display: block; }
        .backdrop.dimmed { cursor: default; }

        .selection-box {
          display: none;
          position: fixed;
          border: 2px solid #ef4444;
          background: rgba(220, 38, 38, 0.16);
          box-shadow: 0 0 0 9999px rgba(8, 8, 8, 0.52);
          z-index: 2147483645;
          pointer-events: none;
        }
        .selection-box.active { display: block; }

        .banner {
          display: none;
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #111111;
          color: #ffffff;
          border: 1px solid #dc2626;
          padding: 12px 22px;
          border-radius: 999px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          font-weight: 600;
          z-index: 2147483647;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.75);
          user-select: none;
        }
        .banner.active { display: flex; align-items: center; gap: 12px; }
        .banner button {
          background: #222222;
          color: #ffffff;
          border: 1px solid #333333;
          padding: 4px 10px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
        }
        .banner button:hover {
          background: #dc2626;
          border-color: #ffffff;
        }

        .card {
          display: none;
          position: fixed;
          bottom: 155px;
          right: 22px;
          width: 390px;
          max-height: 75vh;
          overflow-y: auto;
          background: #111111;
          color: #ffffff;
          border: 1px solid #333333;
          border-radius: 20px;
          padding: 18px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          z-index: 2147483647;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.75);
        }
        .card.active { display: block; }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #333333;
        }
        .badge {
          padding: 5px 11px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.4px;
          display: inline-block;
          background: #dc2626;
          color: #ffffff;
          border: 1px solid #ffffff;
        }
        .verdict-POTWIERDZONE { background: #ffffff; color: #080808; border: 1px solid #ffffff; }
        .verdict-FAŁSZYWE { background: #dc2626; color: #ffffff; border: 1px solid #ffffff; }
        .verdict-WPROWADZAJĄCE { background: #991b1b; color: #ffffff; border: 1px solid #ef4444; }
        .verdict-BRAK { background: #222222; color: #b8b8b8; border: 1px solid #333333; }

        .close-x {
          background: #161616;
          border: 1px solid #333333;
          color: #ffffff;
          width: 30px;
          height: 30px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .close-x:hover {
          background: #dc2626;
          border-color: #ffffff;
          color: #ffffff;
        }

        .summary { font-size: 13px; line-height: 1.55; color: #f5f5f5; margin-bottom: 12px; }
        .preview-thumb {
          width: 100%;
          max-height: 140px;
          object-fit: contain;
          background: #080808;
          border: 1px solid #ffffff;
          border-radius: 10px;
          margin-bottom: 10px;
        }
        .bar-wrap {
          background: #161616;
          border: 1px solid #333333;
          border-radius: 10px;
          padding: 10px;
          margin-bottom: 12px;
        }
        .bar-label {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #b8b8b8;
          margin-bottom: 5px;
        }
        .bar-bg {
          height: 8px;
          background: #222222;
          border: 1px solid #333333;
          border-radius: 999px;
          overflow: hidden;
        }
        .bar-fill { height: 100%; background: #dc2626; transition: width 0.4s ease; }

        .source-box {
          background: #161616;
          border-left: 4px solid #dc2626;
          border-top: 1px solid #333333;
          border-right: 1px solid #333333;
          border-bottom: 1px solid #333333;
          padding: 8px 10px;
          border-radius: 8px;
          margin-bottom: 8px;
          font-size: 12px;
        }
        .source-box a {
          color: #ffffff;
          text-decoration: underline;
          text-decoration-color: #dc2626;
          font-weight: 700;
          display: block;
        }
        .source-quote { color: #d4d4d4; font-style: italic; margin-top: 4px; font-size: 11px; }
        .limits {
          font-size: 11px;
          color: #b8b8b8;
          margin-top: 10px;
          border-top: 1px solid #333333;
          padding-top: 10px;
        }
        .limits strong { color: #ffffff; }

        .actions { display: flex; gap: 8px; margin-top: 14px; }
        .btn-primary {
          flex: 1;
          background: #dc2626;
          color: #ffffff;
          border: 1px solid #ffffff;
          padding: 10px 14px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
        }
        .btn-primary:hover { background: #ef4444; }
        .alert-sec {
          background: #161616;
          border: 1px solid #ef4444;
          color: #ffffff;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 11px;
          margin-bottom: 10px;
        }

        /* OVERLAY NA TEJ SAMEJ STRONIE (PALETA ZE STYLES.CSS) */
        .page-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(8, 8, 8, 0.88);
          backdrop-filter: blur(4px);
          z-index: 2147483647;
          padding: 24px;
          overflow-y: auto;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #ffffff;
        }
        .page-overlay.active {
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }
        .overlay-box {
          width: 100%;
          max-width: 1040px;
          background: linear-gradient(180deg, #121212 0%, #080808 100%);
          border: 1px solid #333333;
          border-radius: 22px;
          padding: 22px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9);
          margin: auto;
        }
        .overlay-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #dc2626;
          padding-bottom: 14px;
          margin-bottom: 18px;
          gap: 12px;
        }
        .overlay-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 18px;
        }
        .overlay-charts-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(200px, 1fr));
          gap: 14px;
          margin-bottom: 14px;
        }
        .overlay-circle-card {
          background: #161616;
          border: 1px solid #333333;
          border-radius: 18px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .overlay-circle-card h4 {
          margin: 4px 0 2px;
          font-size: 14px;
          color: #ffffff;
          text-align: center;
        }
        .overlay-circle-sub {
          font-size: 11px;
          color: #b8b8b8;
          margin-bottom: 10px;
          text-align: center;
        }
        .overlay-canvas-wrap {
          width: 180px;
          height: 180px;
          border-radius: 50%;
          background: #080808;
          border: 2px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
        }
        .overlay-legend {
          list-style: none;
          padding: 0;
          margin: 0;
          width: 100%;
          display: grid;
          gap: 6px;
        }
        .overlay-legend-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          background: #111111;
          border: 1px solid #333333;
          border-radius: 8px;
          padding: 6px 8px;
          font-size: 11px;
          color: #ffffff;
        }
        .overlay-dot-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          border: 1px solid #ffffff;
          flex-shrink: 0;
        }
        .overlay-panel {
          background: #111111;
          border: 1px solid #333333;
          border-radius: 18px;
          padding: 16px;
        }
        .overlay-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .overlay-kpi {
          background: #161616;
          border: 1px solid #333333;
          border-radius: 12px;
          padding: 10px 12px;
        }
        .overlay-kpi span {
          display: block;
          font-size: 11px;
          color: #b8b8b8;
        }
        .overlay-kpi strong {
          display: block;
          margin-top: 2px;
          font-size: 15px;
          color: #ffffff;
        }
        @media (max-width: 860px) {
          .overlay-grid, .overlay-charts-row { grid-template-columns: 1fr; }
        }
      </style>

      <div class="backdrop" id="backdrop"></div>
      <div class="selection-box" id="selectionBox"></div>
      <div class="banner" id="banner">
        <span>✂️ Przeciągnij myszką, aby zaznaczyć obszar na stronie, który Prawdowid ma sprawdzić...</span>
        <button id="cancelSelect">Anuluj</button>
      </div>

      <div class="card" id="resultCard">
        <div class="header">
          <span style="font-size: 12px; font-weight: 800; color: #ffffff;">☕ PROFESOREK PRAWDOWID</span>
          <button class="close-x" id="closeCard">✕</button>
        </div>
        <div id="cardBody"></div>
      </div>

      <div class="page-overlay" id="pageOverlay">
        <div class="overlay-box">
          <div class="overlay-head">
            <div>
              <div style="font-size: 12px; font-weight: 800; color: #ef4444;">☕ PROFESOREK PRAWDOWID • PEŁNA ANALIZA</div>
              <div id="overlaySubtitle" style="font-size: 11px; color: #b8b8b8;"></div>
            </div>
            <button class="close-x" id="closeOverlay">✕</button>
          </div>
          <div id="overlayContent"></div>
        </div>
      </div>

      <button class="prof-btn" id="profBtn" title="Kliknij Profesorka, aby zaznaczyć obszar strony do weryfikacji">
        <img id="profImg" src="${SPRITES.idle}" alt="Profesorek" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
        <span class="prof-fallback" style="display:none;">🧐☕</span>
      </button>
    `;

    const profBtn = shadow.getElementById("profBtn");
    const profImg = shadow.getElementById("profImg");
    const backdrop = shadow.getElementById("backdrop");
    const selectionBox = shadow.getElementById("selectionBox");
    const banner = shadow.getElementById("banner");
    const cancelSelect = shadow.getElementById("cancelSelect");
    const resultCard = shadow.getElementById("resultCard");
    const cardBody = shadow.getElementById("cardBody");
    const closeCard = shadow.getElementById("closeCard");
    const pageOverlay = shadow.getElementById("pageOverlay");
    const overlayContent = shadow.getElementById("overlayContent");
    const overlaySubtitle = shadow.getElementById("overlaySubtitle");
    const closeOverlay = shadow.getElementById("closeOverlay");

    function setProfState(state) {
      profImg.style.display = "block";
      profImg.nextElementSibling.style.display = "none";
      profImg.src = SPRITES[state] || SPRITES.idle;
      if (state === "thinking") {
        profBtn.classList.add("thinking");
      } else {
        profBtn.classList.remove("thinking");
      }
    }

    function applyEnabledState(enabled) {
      host.style.display = enabled === false ? "none" : "block";
      if (enabled === false) exitSelectMode();
    }

    try {
      const storageGet = extApi.storage?.local?.get(["prawdowid_enabled"]);
      if (storageGet && typeof storageGet.then === "function") {
        storageGet.then((res) => applyEnabledState(res?.prawdowid_enabled));
      } else if (extApi.storage?.local?.get) {
        extApi.storage.local.get(["prawdowid_enabled"], (res) => {
          applyEnabledState(res?.prawdowid_enabled);
        });
      }
    } catch (_) {}

    extApi.storage?.onChanged?.addListener((changes) => {
      if (changes && changes.prawdowid_enabled) {
        applyEnabledState(changes.prawdowid_enabled.newValue);
      }
    });

    function drawW1Radar(canvas, premises = {}) {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const axes = [
        { label: "Autorytet źródeł", val: clampPct(premises.source_authority), color: "#ef4444" },
        { label: "Aktualność (2024–2026)", val: clampPct(premises.data_freshness), color: "#ffffff" },
        { label: "Zgodność cytatów", val: clampPct(premises.quote_alignment), color: "#dc2626" },
        { label: "Niezależne potwierdzenia", val: clampPct(premises.independent_confirmations), color: "#991b1b" }
      ];

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = 62;

      for (const ring of [0.25, 0.5, 0.75, 1]) {
        ctx.beginPath();
        for (let i = 0; i < axes.length; i++) {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
          const r = maxR * ring;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      for (let i = 0; i < axes.length; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
        ctx.stroke();
      }

      ctx.beginPath();
      axes.forEach((ax, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
        const r = (ax.val / 100) * maxR;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(239, 68, 68, 0.34)";
      ctx.fill();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    function drawW2Donut(canvas, breakdown = []) {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const items = Array.isArray(breakdown) ? breakdown : [];
      const total = items.reduce((acc, it) => acc + Math.max(0, Number(it.count || 0)), 0);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const outerR = 66;
      const innerR = 38;

      if (total === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
        ctx.closePath();
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.fill();
      } else {
        let startAngle = -Math.PI / 2;
        for (const item of items) {
          const val = Math.max(0, Number(item.count || 0));
          if (val === 0) continue;
          const slice = (val / total) * Math.PI * 2;
          const endAngle = startAngle + slice;

          ctx.beginPath();
          ctx.arc(cx, cy, outerR, startAngle, endAngle);
          ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
          ctx.closePath();
          ctx.fillStyle = item.color || "#ef4444";
          ctx.fill();
          ctx.strokeStyle = "#080808";
          ctx.lineWidth = 2;
          ctx.stroke();

          startAngle = endAngle;
        }
      }

      ctx.fillStyle = "#ffffff";
      ctx.font = "800 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${total}`, cx, cy - 5);
      ctx.fillStyle = "#b8b8b8";
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillText("źródeł", cx, cy + 10);
    }

    function openOverlay() {
      if (!lastResult) return;
      const { data, imageDataUrl } = lastResult;
      const premises = data.premises || {};
      const breakdown = Array.isArray(data.source_breakdown) ? data.source_breakdown : [];
      const allSources = (data.claims || []).flatMap((c) => c.sources || []);
      const confidencePct = Math.round((data.confidence_score || 0) * 100);
      const vClass = getVerdictClass(data.verdict);
      const metrics = data.metrics || {};

      overlaySubtitle.textContent = `Sesja: ${data.session_id || "—"} • ${WEB_APP_URL}`;

      const radarAxes = [
        { label: "Autorytet źródeł", val: clampPct(premises.source_authority), color: "#ef4444" },
        { label: "Aktualność (2024–2026)", val: clampPct(premises.data_freshness), color: "#ffffff" },
        { label: "Zgodność cytatów", val: clampPct(premises.quote_alignment), color: "#dc2626" },
        { label: "Niezależne potwierdzenia", val: clampPct(premises.independent_confirmations), color: "#991b1b" }
      ];

      const radarLegend = radarAxes
        .map(
          (ax) => `
          <li class="overlay-legend-item">
            <div class="overlay-dot-wrap">
              <span class="dot" style="background:${ax.color};"></span>
              <span>${ax.label}</span>
            </div>
            <strong>${ax.val}%</strong>
          </li>
        `
        )
        .join("");

      const totalSources = breakdown.reduce((acc, it) => acc + Math.max(0, Number(it.count || 0)), 0);
      const safeTotal = totalSources || 1;
      const donutLegend = breakdown.length
        ? breakdown
            .map((it) => {
              const cnt = Number(it.count || 0);
              const pct = totalSources ? Math.round((cnt / safeTotal) * 100) : 0;
              return `
                <li class="overlay-legend-item">
                  <div class="overlay-dot-wrap">
                    <span class="dot" style="background:${it.color || "#ef4444"};"></span>
                    <span>${it.label}</span>
                  </div>
                  <strong>${cnt} (${pct}%)</strong>
                </li>
              `;
            })
            .join("")
        : `<li class="overlay-legend-item"><span>Brak danych o źródłach</span><strong>0</strong></li>`;

      const sourcesHtml = allSources.length
        ? allSources
            .map(
              (s) => `
            <div class="source-box">
              <a href="${s.url}" target="_blank">${s.title} (${s.date}) ↗</a>
              <div style="font-size: 10px; color: #b8b8b8;">${s.publisher}</div>
              <div class="source-quote">"${s.quote}"</div>
            </div>
          `
            )
            .join("")
        : `<div style="font-size: 12px; color: #b8b8b8;">Brak cytatów dla tego wycinka.</div>`;

      overlayContent.innerHTML = `
        <div class="overlay-grid">
          <div>
            <div class="overlay-charts-row">
              <div class="overlay-circle-card">
                <h4>W1 • Siła przesłanek</h4>
                <div class="overlay-circle-sub">Rozbicie confidence_score (0–100%)</div>
                <div class="overlay-canvas-wrap">
                  <canvas id="ovW1Canvas" width="170" height="170"></canvas>
                </div>
                <ul class="overlay-legend">${radarLegend}</ul>
              </div>
              <div class="overlay-circle-card">
                <h4>W2 • Typy i pochodzenie źródeł</h4>
                <div class="overlay-circle-sub">Rejestry, fact-check, informacje</div>
                <div class="overlay-canvas-wrap">
                  <canvas id="ovW2Canvas" width="170" height="170"></canvas>
                </div>
                <ul class="overlay-legend">${donutLegend}</ul>
              </div>
            </div>

            <div class="overlay-kpi-grid">
              <div class="overlay-kpi"><span>Siła werdyktu</span><strong>${confidencePct}%</strong></div>
              <div class="overlay-kpi"><span>Czas analizy</span><strong>${metrics.latency_ms ?? 0} ms</strong></div>
              <div class="overlay-kpi"><span>Szac. koszt</span><strong>${metrics.estimated_cost_pln ?? "0,004"} zł</strong></div>
            </div>
          </div>

          <div class="overlay-panel">
            <div style="margin-bottom: 10px;">
              <span class="badge ${vClass}">${data.verdict}</span>
            </div>
            <div class="summary">${data.summary || ""}</div>
            <img src="${imageDataUrl}" alt="Zaznaczony wycinek" class="preview-thumb" style="max-height: 150px;" />
            <div style="font-size: 11px; font-weight: 700; color: #b8b8b8; margin-bottom: 6px;">ŹRÓDŁA (${allSources.length}):</div>
            <div style="max-height: 210px; overflow-y: auto;">${sourcesHtml}</div>
            <div class="limits">ℹ️ <strong>Ograniczenia:</strong> ${data.limitations || ""}</div>
          </div>
        </div>
      `;

      pageOverlay.classList.add("active");
      requestAnimationFrame(() => {
        drawW1Radar(shadow.getElementById("ovW1Canvas"), premises);
        drawW2Donut(shadow.getElementById("ovW2Canvas"), breakdown);
      });
    }

    closeOverlay.addEventListener("click", () => {
      pageOverlay.classList.remove("active");
    });

    pageOverlay.addEventListener("click", (e) => {
      if (e.target === pageOverlay) {
        pageOverlay.classList.remove("active");
      }
    });

    function resetSelectionBox() {
      isDragging = false;
      currentRect = null;
      selectionBox.classList.remove("active");
      selectionBox.style.left = "0px";
      selectionBox.style.top = "0px";
      selectionBox.style.width = "0px";
      selectionBox.style.height = "0px";
    }

    function exitSelectMode() {
      selectMode = false;
      resetSelectionBox();
      backdrop.classList.remove("active", "dimmed");
      banner.classList.remove("active");
      setProfState("idle");
    }

    function enterSelectMode() {
      selectMode = true;
      resetSelectionBox();
      pageOverlay.classList.remove("active");
      resultCard.classList.remove("active");
      backdrop.classList.remove("dimmed");
      backdrop.classList.add("active");
      banner.classList.add("active");
      setProfState("thinking");
    }

    profBtn.addEventListener("click", () => {
      if (selectMode) {
        exitSelectMode();
      } else {
        enterSelectMode();
      }
    });

    cancelSelect.addEventListener("click", (e) => {
      e.stopPropagation();
      exitSelectMode();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (pageOverlay.classList.contains("active")) {
          pageOverlay.classList.remove("active");
        } else if (selectMode) {
          exitSelectMode();
        }
      }
    });

    closeCard.addEventListener("click", () => {
      resultCard.classList.remove("active");
      backdrop.classList.remove("active", "dimmed");
      setProfState("idle");
    });

    backdrop.addEventListener("mousedown", (e) => {
      if (!selectMode || e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      currentRect = { left: startX, top: startY, width: 0, height: 0 };

      selectionBox.style.left = `${startX}px`;
      selectionBox.style.top = `${startY}px`;
      selectionBox.style.width = "0px";
      selectionBox.style.height = "0px";
      selectionBox.classList.add("active");
    });

    window.addEventListener("mousemove", (e) => {
      if (!selectMode || !isDragging) return;
      const curX = e.clientX;
      const curY = e.clientY;

      const left = Math.max(0, Math.min(startX, curX));
      const top = Math.max(0, Math.min(startY, curY));
      const width = Math.min(window.innerWidth - left, Math.abs(curX - startX));
      const height = Math.min(window.innerHeight - top, Math.abs(curY - startY));

      currentRect = { left, top, width, height };
      selectionBox.style.left = `${left}px`;
      selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;
    });

    window.addEventListener("mouseup", async () => {
      if (!selectMode || !isDragging) return;
      const rect = currentRect;
      selectMode = false;
      isDragging = false;
      banner.classList.remove("active");
      selectionBox.classList.remove("active");

      if (!rect || rect.width < 12 || rect.height < 12) {
        backdrop.classList.remove("active");
        setProfState("idle");
        return;
      }

      backdrop.classList.remove("active");
      await new Promise((r) => setTimeout(r, 40));

      try {
        const croppedDataUrl = await captureCroppedArea(rect);
        backdrop.classList.add("active", "dimmed");
        await verifySelectedArea(croppedDataUrl, rect);
      } catch (err) {
        setProfState("answered");
        backdrop.classList.add("active", "dimmed");
        resultCard.classList.add("active");
        cardBody.innerHTML = `
          <div class="alert-sec">
            <strong>Komunikat techniczny (nie jest to werdykt):</strong><br/>
            ${err.message || "Nie udało się przechwycić obszaru."}
          </div>
        `;
      }
    });

    function sendCaptureMessage() {
      return new Promise((resolve, reject) => {
        try {
          const maybePromise = extApi.runtime.sendMessage(
            { type: "CAPTURE_VISIBLE_TAB" },
            (res) => {
              const lastErr = extApi.runtime?.lastError;
              if (lastErr) {
                reject(new Error(lastErr.message));
                return;
              }
              resolve(res);
            }
          );

          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.then(resolve).catch(reject);
          }
        } catch (err) {
          reject(err);
        }
      });
    }

    function captureCroppedArea(rect) {
      return new Promise((resolve, reject) => {
        sendCaptureMessage()
          .then((res) => {
            if (!res || !res.ok || !res.dataUrl) {
              reject(new Error(res?.error || "Błąd zrzutu ekranu."));
              return;
            }

            const img = new Image();
            img.onload = () => {
              const scaleX = img.naturalWidth / window.innerWidth;
              const scaleY = img.naturalHeight / window.innerHeight;

              const sx = Math.max(0, Math.round(rect.left * scaleX));
              const sy = Math.max(0, Math.round(rect.top * scaleY));
              const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(rect.width * scaleX)));
              const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(rect.height * scaleY)));

              const canvas = document.createElement("canvas");
              canvas.width = sw;
              canvas.height = sh;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

              resolve(canvas.toDataURL("image/png"));
            };
            img.onerror = () => reject(new Error("Nie udało się wczytać zrzutu ekranu."));
            img.src = res.dataUrl;
          })
          .catch((err) => reject(new Error(err?.message || "Nie udało się połączyć z tłem rozszerzenia.")));
      });
    }

    function getVerdictClass(verdict) {
      if (!verdict) return "verdict-BRAK";
      if (verdict.includes("POTWIERDZONE")) return "verdict-POTWIERDZONE";
      if (verdict.includes("FAŁSZYWE")) return "verdict-FAŁSZYWE";
      if (verdict.includes("WPROWADZAJĄCE")) return "verdict-WPROWADZAJĄCE";
      return "verdict-BRAK";
    }

    async function verifySelectedArea(imageDataUrl, rect) {
      setProfState("thinking");
      resultCard.classList.add("active");
      cardBody.innerHTML = `
        <div style="padding: 16px 0; text-align: center;">
          <div style="font-size: 28px; margin-bottom: 8px;">☕🧐</div>
          <div style="font-size: 13px; color: #ffffff; font-weight: 700;">Profesorek sprawdza zaznaczony wycinek ekranu...</div>
          <img src="${imageDataUrl}" alt="Zaznaczony wycinek" class="preview-thumb" style="margin-top: 10px;" />
          <div style="font-size: 11px; color: #b8b8b8;">Obszar: ${Math.round(rect.width)}×${Math.round(rect.height)} px</div>
        </div>
      `;

      try {
        const resp = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "extension_screenshot",
            page_url: window.location.href,
            image_base64: imageDataUrl,
            selection_rect: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          })
        });

        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || "Błąd połączenia z serwerem Prawdowid.");
        }

        const data = await resp.json();
        lastResult = { data, imageDataUrl, rect };
        setProfState("answered");

        const confidencePct = Math.round((data.confidence_score || 0) * 100);
        const vClass = getVerdictClass(data.verdict);

        let sourcesHtml = "";
        const allSources = (data.claims || []).flatMap((c) => c.sources || []);
        if (allSources.length > 0) {
          sourcesHtml = allSources.slice(0, 2).map((s) => `
            <div class="source-box">
              <a href="${s.url}" target="_blank">${s.title} (${s.date}) ↗</a>
              <div style="font-size: 10px; color: #b8b8b8;">${s.publisher}</div>
              <div class="source-quote">"${s.quote}"</div>
            </div>
          `).join("");
        } else {
          sourcesHtml = `<div style="font-size: 11px; color: #b8b8b8; margin-bottom: 8px;">Brak bezpośrednich cytatów w bazie dla tego wycinka.</div>`;
        }

        const secHtml = data.security_alert
          ? `<div class="alert-sec">⚠️ ${data.security_alert}</div>`
          : "";

        cardBody.innerHTML = `
          ${secHtml}
          <img src="${imageDataUrl}" alt="Zaznaczony wycinek" class="preview-thumb" />
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

          <div style="font-size: 11px; font-weight: 700; color: #b8b8b8; margin-bottom: 6px;">ŹRÓDŁA I DOWODY:</div>
          ${sourcesHtml}

          <div class="limits">ℹ️ <strong>Ograniczenia:</strong> ${data.limitations}</div>

          <div class="actions">
            <button type="button" class="btn-primary" id="openOverlayBtn">📊 Otwórz pełną analizę i wykresy na stronie ↗</button>
          </div>
        `;

        shadow.getElementById("openOverlayBtn")?.addEventListener("click", openOverlay);
      } catch (e) {
        setProfState("answered");
        cardBody.innerHTML = `
          <img src="${imageDataUrl}" alt="Zaznaczony wycinek" class="preview-thumb" />
          <div class="alert-sec">
            <strong>Komunikat techniczny (nie jest to werdykt):</strong><br/>
            ${e.message}
          </div>
        `;
      }
    }
  }

  init();
})();