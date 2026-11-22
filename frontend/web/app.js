const API_BASE = window.location.origin;
const MSZ_THRESHOLD_MS = 30000;

let currentSessionData = null;
let uiListenersBound = false;

const MOCK_SESSION = {
  session_id: "demo-session-01",
  verdict: "WPROWADZAJĄCE W BŁĄD",
  confidence_score: 0.78,
  summary:
    "Weryfikowany fragment powołuje się na wybrane dane z okresu 2024–2026 bez pełnego kontekstu aktów prawnych oraz komunikatów urzędowych.",
  limitations:
    "Analiza opiera się na dostępnych źródłach w bazie i wycinku z ekranu; przy sprawach spornych zalecana jest weryfikacja pełnego aktu prawnego.",
  premises: {
    source_authority: 85,
    data_freshness: 92,
    quote_alignment: 72,
    independent_confirmations: 65,
  },
  source_breakdown: [
    {
      label: "Źródła pierwotne / urzędowe (ISAP, Sejm, dane.gov.pl, CERT)",
      count: 3,
      color: "#ef4444",
    },
    {
      label: "Fact-checking (Demagog, Konkret24, FakeNews.pl, Google Fact Check)",
      count: 2,
      color: "#ffffff",
    },
    {
      label: "Informacyjne / encyklopedyczne (PAP, Wikipedia)",
      count: 2,
      color: "#7f1d1d",
    },
  ],
  claims: [
    {
      sources: [
        {
          title: "Komunikat i rejestr aktów prawnych (ISAP / Sejm RP)",
          publisher: "Sejm RP / ISAP",
          date: "2025",
          url: "https://isap.sejm.gov.pl",
          quote: "Przepis wskazuje warunki stosowania regulacji w określonym zakresie podmiotowym.",
        },
        {
          title: "Analiza weryfikacyjna doniesienia publicznego",
          publisher: "Demagog / Konkret24",
          date: "2026",
          url: "https://demagog.org.pl",
          quote: "Wyrwanie fragmentu wypowiedzi z kontekstu zmienia znaczenie twierdzenia.",
        },
      ],
    },
  ],
};

const MOCK_LOGS = {
  total_queries: 42,
  avg_latency_ms: 4820,
  max_latency_ms: 11400,
  cost_per_query_pln: "0,004 zł",
  verdicts: {
    Potwierdzone: 14,
    "Fałszywe": 11,
    "Wprowadzające w błąd": 12,
    "Wstrzymanie / moderator": 5,
  },
};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url = "") {
  const trimmed = String(url || "").trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "#";
}

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    session: params.get("session") || "",
    source: params.get("source") || "web",
  };
}

function getVerdictBadgeClass(verdict = "") {
  const upper = verdict.toUpperCase();
  if (upper.includes("POTWIERDZONE")) return "verdict-badge verdict-ok";
  if (upper.includes("FAŁSZYWE")) return "verdict-badge verdict-bad";
  if (upper.includes("WPROWADZAJĄCE")) return "verdict-badge verdict-warn";
  return "verdict-badge";
}

async function fetchSessionData(sessionId) {
  let targetId = sessionId;

  if (!targetId) {
    try {
      const logsResp = await fetch(`${API_BASE}/api/export/logs`);
      if (logsResp.ok) {
        const logs = await logsResp.json();
        if (Array.isArray(logs) && logs.length > 0) {
          targetId = logs[logs.length - 1].session_id || "";
        }
      }
    } catch (_) {}
  }

  if (!targetId) return { data: MOCK_SESSION, isMock: true };

  try {
    const resp = await fetch(`${API_BASE}/api/session/${encodeURIComponent(targetId)}`);
    if (!resp.ok) throw new Error("Brak sesji w pamięci serwera");
    const json = await resp.json();
    return { data: { ...MOCK_SESSION, ...json }, isMock: false };
  } catch (_) {
    return { data: { ...MOCK_SESSION, session_id: targetId }, isMock: true };
  }
}

async function fetchAuditLogs() {
  try {
    const resp = await fetch(`${API_BASE}/api/export/logs`);
    if (!resp.ok) throw new Error("Brak /api/export/logs");
    const json = await resp.json();
    if (Array.isArray(json)) {
      const counts = {
        Potwierdzone: 0,
        "Fałszywe": 0,
        "Wprowadzające w błąd": 0,
        "Wstrzymanie / moderator": 0,
      };
      let sumMs = 0;
      let maxMs = 0;
      for (const item of json) {
        const v = String(item.verdict || "").toUpperCase();
        if (v.includes("POTWIERDZONE")) counts.Potwierdzone += 1;
        else if (v.includes("FAŁSZYWE")) counts["Fałszywe"] += 1;
        else if (v.includes("WPROWADZAJĄCE")) counts["Wprowadzające w błąd"] += 1;
        else counts["Wstrzymanie / moderator"] += 1;

        const lat = Number(item.latency_ms || 0);
        sumMs += lat;
        if (lat > maxMs) maxMs = lat;
      }
      return {
        data: {
          total_queries: json.length,
          avg_latency_ms: json.length ? Math.round(sumMs / json.length) : 0,
          max_latency_ms: maxMs,
          cost_per_query_pln: "0,004 zł",
          verdicts: counts,
        },
        isMock: false,
      };
    }
    return { data: { ...MOCK_LOGS, ...json }, isMock: false };
  } catch (_) {
    return { data: MOCK_LOGS, isMock: true };
  }
}

function renderW1Radar(premises) {
  const canvas = document.getElementById("w1Chart");
  const legend = document.getElementById("w1Legend");
  if (!canvas || !legend) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const axes = [
    {
      label: "Autorytet źródeł",
      val: clampPct(premises.source_authority),
      color: "#ef4444",
    },
    {
      label: "Aktualność (2024–2026)",
      val: clampPct(premises.data_freshness),
      color: "#ffffff",
    },
    {
      label: "Zgodność cytatów",
      val: clampPct(premises.quote_alignment),
      color: "#dc2626",
    },
    {
      label: "Niezależne potwierdzenia",
      val: clampPct(premises.independent_confirmations),
      color: "#991b1b",
    },
  ];

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const maxR = 82;

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

  legend.innerHTML = axes
    .map(
      (ax) => `
      <li class="metric-item">
        <div class="metric-dot-wrap">
          <span class="dot" style="background:${ax.color}"></span>
          <span>${escapeHtml(ax.label)}</span>
        </div>
        <strong>${ax.val}%</strong>
      </li>
    `
    )
    .join("");
}

function renderW2Donut(breakdown) {
  const canvas = document.getElementById("w2Chart");
  const legend = document.getElementById("w2Legend");
  if (!canvas || !legend) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const items = Array.isArray(breakdown) && breakdown.length ? breakdown : MOCK_SESSION.source_breakdown;
  const total = items.reduce((acc, it) => acc + Math.max(0, Number(it.count || 0)), 0);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const outerR = 88;
  const innerR = 52;

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
  ctx.font = "800 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${total}`, cx, cy - 6);
  ctx.fillStyle = "#b8b8b8";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillText("źródeł", cx, cy + 12);

  const safeTotal = total || 1;
  legend.innerHTML = items
    .map((it) => {
      const count = Number(it.count || 0);
      const pct = total ? Math.round((count / safeTotal) * 100) : 0;
      const safeDotColor = /^#[0-9a-fA-F]{3,6}$/.test(it.color || "") ? it.color : "#ef4444";
      return `
        <li class="metric-item">
          <div class="metric-dot-wrap">
            <span class="dot" style="background:${safeDotColor}"></span>
            <span>${escapeHtml(it.label)}</span>
          </div>
          <strong>${count} (${pct}%)</strong>
        </li>
      `;
    })
    .join("");
}

function ensureConfidenceModalExists() {
  let modal = document.getElementById("confidenceModal");
  if (modal) return modal;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div id="confidenceModal" class="modal-backdrop" aria-hidden="true">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-header">
          <div>
            <span class="modal-tag">METRYKA CONFIDENCE_SCORE</span>
            <h3 id="modalTitle">Skąd wynika siła werdyktu?</h3>
          </div>
          <button id="closeConfidenceModal" class="modal-close" type="button" aria-label="Zamknij">✕</button>
        </div>
        <div class="modal-score-banner">
          <div>
            <span class="modal-score-label">Aktualna pewność klasyfikacji</span>
            <div id="modalVerdictName" class="modal-verdict-sub">—</div>
          </div>
          <div id="modalScoreValue" class="modal-score-big">--%</div>
        </div>
        <p id="modalExplanation" class="modal-explanation"></p>
        <div class="modal-factors-title">Składowe wpływające na ocenę:</div>
        <div id="modalFactorsList" class="modal-factors-list"></div>
        <div class="modal-note">
          <strong>Wskazówka:</strong> Wysoka siła werdyktu przy statusie <em>„NIE PODLEGA WERYFIKACJI”</em> oznacza pewność modelu, że tekst jest opinią/etykietą, a nie twierdzeniem wymagającym źródeł.
        </div>
      </div>
    </div>
  `;
  modal = wrapper.firstElementChild;
  document.body.appendChild(modal);

  modal.querySelector("#closeConfidenceModal").addEventListener("click", closeConfidenceModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeConfidenceModal();
  });
  return modal;
}

function openConfidenceModal() {
  const modal = ensureConfidenceModalExists();
  const data = currentSessionData || MOCK_SESSION;
  const pct = Math.round(Number(data.confidence_score || 0) * 100);
  const verdict = String(data.verdict || "BRAK WERYFIKACJI").toUpperCase();
  const sources = (data.claims || []).flatMap((c) => c.sources || []);
  const premises = data.premises || {};

  document.getElementById("modalVerdictName").textContent = verdict;
  document.getElementById("modalScoreValue").textContent = `${pct}%`;

  const explanationEl = document.getElementById("modalExplanation");
  const factorsEl = document.getElementById("modalFactorsList");

  if (verdict.includes("NIE PODLEGA")) {
    explanationEl.textContent =
      `Wynik ${pct}% określa pewność klasyfikacji typu wypowiedzi. Model jednoznacznie rozpoznał, że analizowany tekst jest opinią, hasłem lub etykietą bez weryfikowalnego faktu — dlatego nie wymagano do niego źródeł zewnętrznych.`;
    factorsEl.innerHTML = `
      <div class="modal-factor-row">
        <div class="modal-factor-top"><span>Pewność rozpoznania kategorii (opinia / etykieta)</span><strong>${pct}%</strong></div>
        <div class="v-track"><div class="v-fill" style="width:${pct}%;"></div></div>
      </div>
      <div class="modal-factor-row">
        <div class="modal-factor-top"><span>Liczba weryfikowalnych twierdzeń faktograficznych</span><strong>0</strong></div>
        <div class="v-track"><div class="v-fill" style="width:0%;"></div></div>
      </div>
    `;
  } else if (verdict.includes("BRAK WYSTARCZAJĄCYCH")) {
    explanationEl.textContent =
      `Wynik ${pct}% odzwierciedla brak jednoznacznego pokrycia w zaufanych rejestrach. System wstrzymał się od rozstrzygnięcia, ponieważ znalezione dokumenty nie potwierdzają ani nie obalają tezy wprost.`;
    factorsEl.innerHTML = `
      <div class="modal-factor-row">
        <div class="modal-factor-top"><span>Pokrycie w źródłach pierwotnych</span><strong>${clampPct(premises.source_authority)}%</strong></div>
        <div class="v-track"><div class="v-fill" style="width:${clampPct(premises.source_authority)}%;"></div></div>
      </div>
      <div class="modal-factor-row">
        <div class="modal-factor-top"><span>Zgodność cytatów z tezą</span><strong>${clampPct(premises.quote_alignment)}%</strong></div>
        <div class="v-track"><div class="v-fill" style="width:${clampPct(premises.quote_alignment)}%;"></div></div>
      </div>
    `;
  } else {
    explanationEl.textContent =
      `Wynik ${pct}% to wypadkowa jakości użytych źródeł (${sources.length} cytowań), ich aktualności (2024–2026) oraz spójności znalezionych cytatów z badanym twierdzeniem.`;
    factorsEl.innerHTML = `
      <div class="modal-factor-row">
        <div class="modal-factor-top"><span>Autorytet źródeł (ISAP, Sejm, CERT, Demagog)</span><strong>${clampPct(premises.source_authority)}%</strong></div>
        <div class="v-track"><div class="v-fill" style="width:${clampPct(premises.source_authority)}%;"></div></div>
      </div>
      <div class="modal-factor-row">
        <div class="modal-factor-top"><span>Aktualność danych (2024–2026)</span><strong>${clampPct(premises.data_freshness)}%</strong></div>
        <div class="v-track"><div class="v-fill" style="width:${clampPct(premises.data_freshness)}%;"></div></div>
      </div>
      <div class="modal-factor-row">
        <div class="modal-factor-top"><span>Zgodność cytatów z twierdzeniem</span><strong>${clampPct(premises.quote_alignment)}%</strong></div>
        <div class="v-track"><div class="v-fill" style="width:${clampPct(premises.quote_alignment)}%;"></div></div>
      </div>
      <div class="modal-factor-row">
        <div class="modal-factor-top"><span>Niezależne potwierdzenia domenowe</span><strong>${clampPct(premises.independent_confirmations)}%</strong></div>
        <div class="v-track"><div class="v-fill" style="width:${clampPct(premises.independent_confirmations)}%;"></div></div>
      </div>
    `;
  }

  modal.style.display = "flex";
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeConfidenceModal() {
  const modal = document.getElementById("confidenceModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function renderAnalysis(sessionData, isMock) {
  const meta = document.getElementById("sessionMeta");
  const q = getQueryParams();
  meta.textContent = `Sesja: ${sessionData.session_id || "brak"} • Kanał: ${q.source}${
    isMock ? " • Tryb podglądu (fallback)" : ""
  }`;

  const badge = document.getElementById("verdictBadge");
  badge.textContent = sessionData.verdict || "BRAK WERYFIKACJI";
  badge.className = getVerdictBadgeClass(sessionData.verdict);

  const pct = Math.round(Number(sessionData.confidence_score || 0) * 100);
  const confTextEl = document.getElementById("confidenceText");
  if (confTextEl) {
    confTextEl.textContent = `Siła werdyktu: ${pct}%`;
  }
  document.getElementById("analysisSummary").textContent = sessionData.summary || "";

  const secBox = document.getElementById("securityAlertBox");
  if (secBox) {
    if (sessionData.security_alert) {
      secBox.textContent = `⚠️ ${sessionData.security_alert}`;
      secBox.style.display = "block";
    } else {
      secBox.style.display = "none";
    }
  }

  const incBox = document.getElementById("incidentContextBox");
  if (incBox) {
    if (sessionData.incident_context) {
      incBox.textContent = `🗂️ ${sessionData.incident_context}`;
      incBox.style.display = "block";
    } else {
      incBox.style.display = "none";
    }
  }

  const modBox = document.getElementById("moderatorCaseBox");
  if (modBox) {
    const mc = sessionData.moderator_case;
    if (mc && mc.case_id) {
      modBox.textContent = `🛡️ Kolejka analityka: ${mc.case_id} (${mc.status}, zgłoszeń: ${mc.report_count || 1}) — ${mc.notice || ""}`;
      modBox.style.display = "block";
    } else {
      modBox.style.display = "none";
    }
  }

  const sources = (sessionData.claims || []).flatMap((c) => c.sources || []);
  const sourcesEl = document.getElementById("sourcesList");
  if (sources.length) {
    sourcesEl.innerHTML = sources
      .map(
        (s) => `
        <div class="source-item">
          <a href="${escapeHtml(sanitizeUrl(s.url))}" target="_blank" rel="noopener">${escapeHtml(s.title || "Źródło")} (${escapeHtml(s.date || "")}) ↗</a>
          <div style="font-size:11px;color:#b8b8b8;">${escapeHtml(s.publisher || "")}</div>
          ${s.quote ? `<p>"${escapeHtml(s.quote)}"</p>` : ""}
        </div>
      `
      )
      .join("");
  } else {
    sourcesEl.innerHTML = `<div class="source-item">Brak bezpośrednich cytatów w tej sesji.</div>`;
  }

  document.querySelector("#limitationsBox span").textContent =
    sessionData.limitations || "Brak dodatkowych uwag.";

  const previewBox = document.getElementById("previewBox");
  const previewImg = document.getElementById("previewImg");
  const shotSrc = sessionData.image_base64 || sessionStorage.getItem("prawdowid_last_shot");
  if (shotSrc && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(shotSrc)) {
    previewBox.style.display = "block";
    previewImg.src = shotSrc;
  } else {
    previewBox.style.display = "none";
  }
}

function renderAudit(logsData) {
  document.getElementById("auditCostKpi").textContent = `Koszt: ${
    logsData.cost_per_query_pln || "0,004 zł"
  } / zapytanie`;

  const kpis = document.getElementById("auditKpis");
  kpis.innerHTML = `
    <div class="kpi-box"><span>Łącznie zapytań</span><strong>${logsData.total_queries ?? 0}</strong></div>
    <div class="kpi-box"><span>Śr. czas odpowiedzi</span><strong>${logsData.avg_latency_ms ?? 0} ms</strong></div>
    <div class="kpi-box"><span>Maks. czas</span><strong>${logsData.max_latency_ms ?? 0} ms</strong></div>
  `;

  const verdicts = logsData.verdicts || {};
  const total = Object.values(verdicts).reduce((a, b) => a + Number(b || 0), 0) || 1;
  const verdictsEl = document.getElementById("auditVerdicts");
  verdictsEl.innerHTML = Object.entries(verdicts)
    .map(([name, count]) => {
      const pct = Math.round((Number(count || 0) / total) * 100);
      return `
        <div class="v-row">
          <div class="v-row-top"><span>${escapeHtml(name)}</span><strong>${count} (${pct}%)</strong></div>
          <div class="v-track"><div class="v-fill" style="width:${pct}%;"></div></div>
        </div>
      `;
    })
    .join("");

  const avg = Number(logsData.avg_latency_ms || 0);
  const ratio = Math.min(100, Math.round((avg / MSZ_THRESHOLD_MS) * 100));
  document.getElementById("auditLatency").innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <span>Czas odpowiedzi vs limit MSZ (${MSZ_THRESHOLD_MS.toLocaleString("pl-PL")} ms)</span>
      <strong>${ratio}% limitu</strong>
    </div>
    <div class="v-track">
      <div class="v-fill" style="width:${ratio}%;background:${ratio > 85 ? "#ef4444" : "#ffffff"};"></div>
    </div>
  `;
}

function clampPct(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function appendChatMessage(role, text) {
  const box = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = `msg msg-${role}`;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function askAiChat(question) {
  const statusEl = document.getElementById("chatStatus");
  const sessionData = currentSessionData || MOCK_SESSION;
  statusEl.textContent = "Myśli...";
  try {
    const resp = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionData.session_id,
        question,
      }),
    });
    if (!resp.ok) throw new Error("Błąd /api/chat");
    const data = await resp.json();
    appendChatMessage("ai", data.answer || "Brak odpowiedzi z serwera.");
  } catch (_) {
    appendChatMessage(
      "ai",
      `Na podstawie obecnego werdyktu (${sessionData.verdict}) oraz siły przesłanek: w pytaniu "${question}" kluczowe znaczenie ma zestawienie źródeł pierwotnych (np. ISAP/Sejm) z aktualnością danych z lat 2024–2026.`
    );
  } finally {
    statusEl.textContent = "Gotowy";
  }
}

async function runVerifyRequest(rawInput, channelKey, onErrorTargetId, onStatusTargetId, onButtonId) {
  const statusEl = document.getElementById(onStatusTargetId);
  const errorEl = document.getElementById(onErrorTargetId);
  const submitBtn = document.getElementById(onButtonId);

  if (errorEl) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }
  if (statusEl) statusEl.textContent = "Weryfikuję...";
  if (submitBtn) submitBtn.disabled = true;

  try {
    const resp = await fetch(`${API_BASE}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input_text: rawInput,
        channel: channelKey,
      }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload.detail || "Nie udało się zweryfikować treści.");
    }

    const merged = { ...MOCK_SESSION, ...payload };
    currentSessionData = merged;

    const url = new URL(window.location.href);
    if (merged.session_id) {
      url.searchParams.set("session", merged.session_id);
      url.searchParams.set("source", channelKey);
      window.history.replaceState({}, "", url.toString());
    }

    renderAnalysis(merged, false);
    renderW1Radar(merged.premises || MOCK_SESSION.premises);
    renderW2Donut(merged.source_breakdown || MOCK_SESSION.source_breakdown);

    const { data: logsData } = await fetchAuditLogs();
    renderAudit(logsData);

    return merged;
  } catch (err) {
    const msg = err.message || "Błąd weryfikacji.";
    if (errorEl) {
      errorEl.textContent = `⚠️ ${msg}`;
      errorEl.style.display = "block";
    }
    throw new Error(msg);
  } finally {
    if (statusEl) statusEl.textContent = "Gotowy";
    if (submitBtn) submitBtn.disabled = false;
  }
}

function appendChannelBubble(sender, text, channelName, isBotReply = false) {
  const feed = document.getElementById("channelFeed");
  if (!feed) return;

  const bubble = document.createElement("div");
  bubble.className = isBotReply ? "ch-msg ch-msg-bot" : "ch-msg ch-msg-incoming";

  const meta = document.createElement("div");
  meta.className = "ch-meta";
  meta.textContent = `${channelName} • ${sender}`;

  const body = document.createElement("div");
  body.textContent = text;

  bubble.appendChild(meta);
  bubble.appendChild(body);
  feed.appendChild(bubble);
  feed.scrollTop = feed.scrollHeight;
}

function bindChannelAdapter() {
  const form = document.getElementById("channelForm");
  const selectEl = document.getElementById("channelSelect");
  const feed = document.getElementById("channelFeed");

  if (feed && feed.childElementCount === 0) {
    appendChannelBubble(
      "Prawdowid Bot",
      "Adapter aktywny. Wyślij treść lub link, aby sprawdzić spójność wyniku z kanałem WWW.",
      selectEl?.value || "whatsapp_demo",
      true
    );
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const inputEl = document.getElementById("channelInput");
      const senderEl = document.getElementById("channelSender");
      const text = (inputEl?.value || "").trim();
      const sender = (senderEl?.value || "").trim() || "Anonim";
      const channelKey = selectEl?.value || "whatsapp_demo";
      if (!text) return;
      inputEl.value = "";

      appendChannelBubble(sender, text, channelKey, false);

      try {
        const res = await runVerifyRequest(
          text,
          channelKey,
          "channelError",
          "channelStatus",
          "channelSubmitBtn"
        );
        const pct = Math.round(Number(res.confidence_score || 0) * 100);
        appendChannelBubble(
          "Prawdowid Bot",
          `[${res.verdict || "BRAK WERYFIKACJI"} • Siła: ${pct}%] ${res.summary || ""}`,
          channelKey,
          true
        );
      } catch (err) {
        appendChannelBubble("System", `Błąd techniczny: ${err.message}`, channelKey, true);
      }
    });
  }
}

function bindUiListenersOnce() {
  if (uiListenersBound) return;
  uiListenersBound = true;

  appendChatMessage(
    "ai",
    "Cześć! Tutaj AI Chat do tej weryfikacji. Możesz dopytać o siłę przesłanek (W1), typy źródeł (W2) albo ograniczenia werdyktu."
  );

  const quickForm = document.getElementById("quickVerifyForm");
  if (quickForm) {
    quickForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const inputEl = document.getElementById("verifyInput");
      const val = (inputEl?.value || "").trim();
      if (!val) return;
      try {
        await runVerifyRequest(val, "web", "verifyError", "verifyStatus", "verifySubmitBtn");
      } catch (_) {}
    });
  }

  bindChannelAdapter();

  document.getElementById("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const qText = input.value.trim();
    if (!qText) return;
    input.value = "";
    appendChatMessage("user", qText);
    await askAiChat(qText);
  });

  document.getElementById("reloadDataBtn").addEventListener("click", loadAndRenderPage);

  document.getElementById("toggleAuditBtn").addEventListener("click", () => {
    const panel = document.getElementById("auditPanel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  document.getElementById("mascotBtn").addEventListener("click", () => {
    appendChatMessage(
      "ai",
      "Profesorek przypomina: zawsze sprawdzaj datę aktu lub komunikatu oraz niezależne potwierdzenia."
    );
    document.getElementById("chatInput")?.focus();
  });

  const confBtn = document.getElementById("confidenceBtn") || document.getElementById("confidenceText");
  if (confBtn) {
    confBtn.style.cursor = "pointer";
    confBtn.onclick = openConfidenceModal;
  }

  const closeBtn = document.getElementById("closeConfidenceModal");
  if (closeBtn) closeBtn.onclick = closeConfidenceModal;

  const modal = document.getElementById("confidenceModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeConfidenceModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeConfidenceModal();
  });
}

async function loadAndRenderPage() {
  const { session } = getQueryParams();
  const [{ data: sessionData, isMock }, { data: logsData }] = await Promise.all([
    fetchSessionData(session),
    fetchAuditLogs(),
  ]);

  currentSessionData = sessionData;

  renderAnalysis(sessionData, isMock);
  renderW1Radar(sessionData.premises || MOCK_SESSION.premises);
  renderW2Donut(sessionData.source_breakdown || MOCK_SESSION.source_breakdown);
  renderAudit(logsData);
  bindUiListenersOnce();
}

loadAndRenderPage();