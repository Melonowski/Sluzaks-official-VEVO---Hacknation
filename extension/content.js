(() => {
  if (window.__prawdowidInjected) return;
  window.__prawdowidInjected = true;

  const extApi = typeof browser !== "undefined" && browser.runtime ? browser : chrome;
  const API_URL = "https://sorted-sri-increase-sega.trycloudflare.com/api/verify";
  const WEB_APP_URL = "https://sorted-sri-increase-sega.trycloudflare.com";

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
          filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.55));
        }
        .prof-btn:hover {
          transform: translateY(-6px) scale(1.06);
          filter: drop-shadow(0 14px 24px rgba(56, 189, 248, 0.45));
        }
        .prof-btn.thinking {
          animation: profPulse 1.4s ease-in-out infinite;
          filter: drop-shadow(0 10px 22px rgba(56, 189, 248, 0.65));
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
          background: rgba(2, 6, 23, 0.72);
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
          border: 2px solid #38bdf8;
          background: rgba(56, 189, 248, 0.16);
          box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.45);
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
          user-select: none;
        }
        .banner.active { display: flex; align-items: center; gap: 12px; }
        .banner button {
          background: #334155; color: white; border: none; padding: 4px 10px;
          border-radius: 999px; cursor: pointer; font-size: 12px;
        }

        .card {
          display: none;
          position: fixed;
          bottom: 155px;
          right: 22px;
          width: 390px;
          max-height: 75vh;
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
        .preview-thumb {
          width: 100%;
          max-height: 140px;
          object-fit: contain;
          background: #020617;
          border: 1px solid #1e293b;
          border-radius: 8px;
          margin-bottom: 10px;
        }
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
      <div class="selection-box" id="selectionBox"></div>
      <div class="banner" id="banner">
        <span>✂️ Przeciągnij myszką, aby zaznaczyć obszar na stronie, który Prawdowid ma sprawdzić...</span>
        <button id="cancelSelect">Anuluj</button>
      </div>

      <div class="card" id="resultCard">
        <div class="header">
          <span style="font-size: 12px; font-weight: 700; color: #38bdf8;">☕ PROFESOREK PRAWDOWID</span>
          <button class="close-x" id="closeCard">✕</button>
        </div>
        <div id="cardBody"></div>
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
      if (e.key === "Escape" && selectMode) {
        exitSelectMode();
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
          <div style="font-size: 13px; color: #38bdf8; font-weight: 600;">Profesorek sprawdza zaznaczony wycinek ekranu...</div>
          <img src="${imageDataUrl}" alt="Zaznaczony wycinek" class="preview-thumb" style="margin-top: 10px;" />
          <div style="font-size: 11px; color: #94a3b8;">Obszar: ${Math.round(rect.width)}×${Math.round(rect.height)} px</div>
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
        setProfState("answered");

        const confidencePct = Math.round((data.confidence_score || 0) * 100);
        const vClass = getVerdictClass(data.verdict);

        let sourcesHtml = "";
        const allSources = (data.claims || []).flatMap((c) => c.sources || []);
        if (allSources.length > 0) {
          sourcesHtml = allSources.slice(0, 2).map((s) => `
            <div class="source-box">
              <a href="${s.url}" target="_blank">${s.title} (${s.date}) ↗</a>
              <div style="font-size: 10px; color: #94a3b8;">${s.publisher}</div>
              <div class="source-quote">"${s.quote}"</div>
            </div>
          `).join("");
        } else {
          sourcesHtml = `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">Brak bezpośrednich cytatów w bazie dla tego wycinka.</div>`;
        }

        const secHtml = data.security_alert
          ? `<div class="alert-sec">⚠️ ${data.security_alert}</div>`
          : "";

        const fullResultUrl = `${WEB_APP_URL}?session=${encodeURIComponent(data.session_id || "")}&source=screenshot`;

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

          <div style="font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">ŹRÓDŁA I DOWODY:</div>
          ${sourcesHtml}

          <div class="limits">ℹ️ <strong>Ograniczenia:</strong> ${data.limitations}</div>

          <div class="actions">
            <a class="btn-primary" href="${fullResultUrl}" target="_blank">📊 Otwórz pełną analizę i wykresy na stronie ↗</a>
          </div>
        `;
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