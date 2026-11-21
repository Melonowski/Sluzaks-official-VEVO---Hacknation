const API_BASE = "http://127.0.0.1:8000";
const MSZ_THRESHOLD_MS = 30000;

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
  if (!sessionId) return { data: MOCK_SESSION, isMock: true };
  try {
    const resp = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`);
    if (!resp.ok) throw new Error("Brak endpointu sesji");
    const json = await resp.json();
    return { data: { ...MOCK_SESSION, ...json }, isMock: false };
  } catch (_) {
    return { data: { ...MOCK_SESSION, session_id: sessionId }, isMock: true };
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
          <span>${ax.label}</span>
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
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const items = Array.isArray(breakdown) && breakdown.length ? breakdown : MOCK_SESSION.source_breakdown;
  const total = items.reduce((acc, it) => acc + Math.max(0, Number(it.count || 0)), 0) || 1;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const outerR = 88;
  const innerR = 52;

  let startAngle = -Math.PI / 2;
  for (const item of items) {
    const val = Math.max(0, Number(item.count || 0));
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

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${total}`, cx, cy - 6);
  ctx.fillStyle = "#b8b8b8";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillText("źródeł", cx, cy + 12);

  legend.innerHTML = items
    .map((it) => {
      const pct = Math.round(((Number(it.count || 0)) / total) * 100);
      return `
        <li class="metric-item">
          <div class="metric-dot-wrap">
            <span class="dot" style="background:${it.color || "#ef4444"}"></span>
            <span>${it.label}</span>
          </div>
          <strong>${it.count} (${pct}%)</strong>
        </li>
      `;
    })
    .join("");
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
  document.getElementById("confidenceText").textContent = `Siła werdyktu: ${pct}%`;
  document.getElementById("analysisSummary").textContent = sessionData.summary || "";

  const sources = (sessionData.claims || []).flatMap((c) => c.sources || []);
  const sourcesEl = document.getElementById("sourcesList");
  if (sources.length) {
    sourcesEl.innerHTML = sources
      .map(
        (s) => `
        <div class="source-item">
          <a href="${s.url || "#"}" target="_blank" rel="noopener">${s.title || "Źródło"} (${s.date || ""}) ↗</a>
          <div style="font-size:11px;color:#b8b8b8;">${s.publisher || ""}</div>
          <p>"${s.quote || ""}"</p>
        </div>
      `
      )
      .join("");
  } else {
    sourcesEl.innerHTML = `<div class="source-item">Brak cytatów w tej sesji.</div>`;
  }

  document.querySelector("#limitationsBox span").textContent =
    sessionData.limitations || "Brak dodatkowych uwag.";

  const cachedShot = sessionStorage.getItem("prawdowid_last_shot");
  if (cachedShot) {
    document.getElementById("previewBox").style.display = "block";
    document.getElementById("previewImg").src = cachedShot;
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
          <div class="v-row-top"><span>${name}</span><strong>${count} (${pct}%)</strong></div>
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

async function askAiChat(question, sessionData) {
  const statusEl = document.getElementById("chatStatus");
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
    if (!resp.ok) throw new Error("Brak endpointu /api/chat");
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

async function initPage() {
  const { session } = getQueryParams();
  const [{ data: sessionData, isMock }, { data: logsData }] = await Promise.all([
    fetchSessionData(session),
    fetchAuditLogs(),
  ]);

  renderAnalysis(sessionData, isMock);
  renderW1Radar(sessionData.premises || MOCK_SESSION.premises);
  renderW2Donut(sessionData.source_breakdown || MOCK_SESSION.source_breakdown);
  renderAudit(logsData);

  appendChatMessage(
    "ai",
    "Cześć! Tutaj AI Chat do tej weryfikacji. Możesz dopytać o siłę przesłanek (W1), typy źródeł (W2) albo ograniczenia werdyktu."
  );

  document.getElementById("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const qText = input.value.trim();
    if (!qText) return;
    input.value = "";
    appendChatMessage("user", qText);
    await askAiChat(qText, sessionData);
  });

  document.getElementById("reloadDataBtn").addEventListener("click", initPage);

  document.getElementById("toggleAuditBtn").addEventListener("click", () => {
    const panel = document.getElementById("auditPanel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  document.getElementById("mascotBtn").addEventListener("click", () => {
    appendChatMessage(
      "ai",
      "Profesorek przypomina: zawsze sprawdzaj datę aktu lub komunikatu oraz niezależne potwierdzenia."
    );
  });
}

initPage();