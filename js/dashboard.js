// Dashboard: load data/batting.csv, filter in the browser, and redraw the
// summary numbers, four charts, and table whenever a filter or switch changes.

const FIRST_YEAR = 1901;
const LAST_YEAR = 2025;
const BATS_LABEL = { L: "Left", R: "Right", B: "Switch" };
const MAX_SPLIT_LINES = 8;      // lines in the "by season, per group" chart
const PLAYER_RATE_MIN_AB = 1500; // leaderboard minimum for rate measures
const PLAYER_MEDIAN_MIN_ROWS = 5; // leaderboard minimum for the median measure

let ROWS = [];
const charts = {};
const state = { measure: "avg", breakdown: "era" };

// ---------- aggregation ----------

function emptyAgg() {
  return { rows: 0, players: new Set(), AB: 0, H: 0, HR: 0, T: 0, SO: 0, hrList: [] };
}

function add(a, r) {
  a.rows += 1;
  a.players.add(r.playerID);
  a.AB += r.AB;
  a.H += r.H;
  a.HR += r.HR;
  a.T += r.T;
  a.SO += r.SO;
  a.hrList.push(r.HR);
}

function median(list) {
  if (!list.length) return NaN;
  const s = Float64Array.from(list).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const MEASURES = {
  avg: { label: "Batting average", short: "AVG", calc: (a) => a.H / a.AB, fmt: fmt.avg, rate: true },
  hrr: { label: "HR per 100 AB", short: "HR/100 AB", calc: (a) => (100 * a.HR) / a.AB, fmt: fmt.d2, rate: true },
  sor: { label: "SO per 100 AB", short: "SO/100 AB", calc: (a) => (100 * a.SO) / a.AB, fmt: fmt.d1, rate: true },
  tr: { label: "Triples per 1,000 AB", short: "3B/1,000 AB", calc: (a) => (1000 * a.T) / a.AB, fmt: fmt.d2, rate: true },
  hr: { label: "Total home runs", short: "HR", calc: (a) => a.HR, fmt: fmt.int },
  h: { label: "Total hits", short: "Hits", calc: (a) => a.H, fmt: fmt.int },
  players: { label: "Players", short: "Players", calc: (a) => a.players.size, fmt: fmt.int },
  medhr: { label: "Median HR per player-season", short: "Median HR", calc: (a) => median(a.hrList), fmt: (v) => (isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : "–") },
};

const BREAKDOWNS = {
  era: { label: "Era", key: (r) => r.era, order: ERAS.map((e) => e.era) },
  decade: { label: "Decade", key: (r) => r.decade, sort: "key" },
  lg: { label: "League", key: (r) => r.lg, order: ["AL", "NL"] },
  bats: { label: "Bats", key: (r) => r.batsLabel, order: ["Left", "Right", "Switch", "Unknown"] },
  born: { label: "Birthplace", key: (r) => r.born, order: ["USA", "Outside USA", "Unknown"] },
  franch: { label: "Franchise", key: (r) => r.franch, sort: "ab" },
};

// ---------- data loading ----------

function prepare(raw) {
  const n = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
  return raw
    .filter((r) => r.yearID)
    .map((r) => ({
      year: r.yearID,
      decade: `${Math.floor(r.yearID / 10) * 10}s`,
      era: eraOf(r.yearID),
      playerID: r.playerID,
      name: r.playerName,
      franch: r.franchName,
      lg: r.lgID,
      bats: r.bats || "",
      batsLabel: BATS_LABEL[r.bats] || "Unknown",
      born: !r.birthCountry ? "Unknown" : r.birthCountry === "USA" ? "USA" : "Outside USA",
      AB: n(r.AB),
      H: n(r.H),
      HR: n(r.HR),
      T: n(r["3B"]),
      SO: n(r.SO),
    }));
}

// ---------- filters ----------

const F = {
  from: document.getElementById("f-from"),
  to: document.getElementById("f-to"),
  franch: document.getElementById("f-franch"),
  lg: document.getElementById("f-lg"),
  bats: document.getElementById("f-bats"),
  born: document.getElementById("f-born"),
  minab: document.getElementById("f-minab"),
};

function buildFilterOptions() {
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    F.from.add(new Option(y, y));
    F.to.add(new Option(y, y));
  }
  [...new Set(ROWS.map((r) => r.franch))].sort().forEach((f) => F.franch.add(new Option(f, f)));
}

function resetFilters() {
  F.from.value = FIRST_YEAR;
  F.to.value = LAST_YEAR;
  F.franch.value = "";
  F.lg.value = "";
  F.bats.value = "";
  F.born.value = "";
  F.minab.value = "0";
}

function filtered() {
  let from = +F.from.value;
  let to = +F.to.value;
  if (from > to) [from, to] = [to, from];
  const franch = F.franch.value;
  const lg = F.lg.value;
  const bats = F.bats.value;
  const born = F.born.value;
  const minab = +F.minab.value;
  return ROWS.filter((r) =>
    r.year >= from && r.year <= to &&
    (!franch || r.franch === franch) &&
    (!lg || r.lg === lg) &&
    (!bats || r.bats === bats) &&
    (!born || r.born === born) &&
    r.AB >= minab);
}

// ---------- switches ----------

function buildSwitch(containerId, options, stateKey) {
  const box = document.getElementById(containerId);
  Object.entries(options).forEach(([key, opt]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = opt.label;
    b.dataset.key = key;
    b.addEventListener("click", () => {
      state[stateKey] = key;
      render();
    });
    box.appendChild(b);
  });
}

function syncSwitches() {
  document.querySelectorAll("#sw-measure button").forEach((b) => b.classList.toggle("on", b.dataset.key === state.measure));
  document.querySelectorAll("#sw-break button").forEach((b) => b.classList.toggle("on", b.dataset.key === state.breakdown));
}

// ---------- grouping ----------

function groupBy(rows, keyFn) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, emptyAgg());
    add(m.get(k), r);
  });
  return m;
}

function orderedGroups(groups, bd) {
  const keys = [...groups.keys()];
  if (bd.order) return bd.order.filter((k) => groups.has(k));
  if (bd.sort === "key") return keys.sort();
  return keys.sort((a, b) => groups.get(b).AB - groups.get(a).AB);
}

// ---------- rendering ----------

function setChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

// Bars always start at zero. Line charts of batting average zoom in on the
// .230-.300 range so season-to-season changes are visible.
function valueAxis(bars = false) {
  const isAvg = state.measure === "avg";
  return { beginAtZero: bars || !isAvg, ticks: isAvg ? { callback: (v) => fmt.avg(v) } : {} };
}

function renderSummary(rows, all) {
  document.getElementById("s-rows").textContent = fmt.int(all.rows);
  document.getElementById("s-players").textContent = fmt.int(all.players.size);
  document.getElementById("s-hr").textContent = fmt.int(all.HR);
  document.getElementById("s-avg").textContent = all.AB ? fmt.avg(all.H / all.AB) : "–";
  document.getElementById("s-hrr").textContent = all.AB ? fmt.d2((100 * all.HR) / all.AB) : "–";
  document.getElementById("s-sor").textContent = all.AB ? fmt.d1((100 * all.SO) / all.AB) : "–";
  document.getElementById("status").textContent =
    `Showing ${fmt.int(rows.length)} of ${fmt.int(ROWS.length)} rows.`;
}

function renderGroupChart(groups, keys, m, bd) {
  const horizontal = keys.length > 8;
  let ks = keys;
  if (horizontal) ks = [...keys].sort((a, b) => (m.calc(groups.get(b)) || 0) - (m.calc(groups.get(a)) || 0));
  document.getElementById("t-group").textContent = `${m.label} by ${bd.label.toLowerCase()}`;
  const box = document.getElementById("c-group").parentElement;
  box.style.height = horizontal ? `${Math.max(300, ks.length * 22 + 60)}px` : "";
  setChart("c-group", {
    type: "bar",
    data: {
      labels: ks,
      datasets: [{
        label: m.label,
        data: ks.map((k) => m.calc(groups.get(k))),
        backgroundColor: ks.map((_, i) => (horizontal ? COLORS.navy : SERIES_COLORS[i % SERIES_COLORS.length])),
        borderRadius: 2,
      }],
    },
    options: {
      indexAxis: horizontal ? "y" : "x",
      scales: horizontal
        ? { x: valueAxis(true), y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } } }
        : { x: { grid: { display: false } }, y: valueAxis(true) },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${m.label}: ${m.fmt(horizontal ? c.parsed.x : c.parsed.y)}` } },
      },
    },
  });
}

function seasonRange(rows) {
  if (!rows.length) return [];
  let lo = Infinity;
  let hi = -Infinity;
  rows.forEach((r) => { lo = Math.min(lo, r.year); hi = Math.max(hi, r.year); });
  const ys = [];
  for (let y = lo; y <= hi; y++) ys.push(y);
  return ys;
}

function renderTrendChart(rows, years, m) {
  const byYear = groupBy(rows, (r) => r.year);
  document.getElementById("t-trend").textContent = `${m.label} by season`;
  setChart("c-trend", {
    type: "line",
    data: {
      labels: years,
      datasets: [{
        label: m.label,
        data: years.map((y) => (byYear.has(y) ? m.calc(byYear.get(y)) : null)),
        borderColor: COLORS.red,
        backgroundColor: COLORS.red,
        spanGaps: false,
      }],
    },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 12 } }, y: valueAxis() },
      plugins: {
        legend: { display: false },
        eraBands: { show: true },
        tooltip: { callbacks: { label: (c) => `${m.label}: ${m.fmt(c.parsed.y)}` } },
      },
    },
  });
}

function renderSplitChart(rows, years, groups, keys, m, bd) {
  const shown = bd.sort === "ab" ? keys.slice(0, MAX_SPLIT_LINES) : keys.slice(0, 12);
  const byYearGroup = groupBy(rows, (r) => `${r.year}|${bd.key(r)}`);
  document.getElementById("t-split").textContent = `${m.label} by season and ${bd.label.toLowerCase()}`;
  document.getElementById("n-split").textContent = keys.length > shown.length
    ? `Showing the ${shown.length} ${bd.label.toLowerCase()} groups with the most at-bats in the current view.`
    : `One line per ${bd.label.toLowerCase()} group.`;
  setChart("c-split", {
    type: "line",
    data: {
      labels: years,
      datasets: shown.map((k, i) => ({
        label: k,
        data: years.map((y) => {
          const a = byYearGroup.get(`${y}|${k}`);
          return a ? m.calc(a) : null;
        }),
        borderColor: SERIES_COLORS[i % SERIES_COLORS.length],
        backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
        borderWidth: 1.8,
        spanGaps: false,
      })),
    },
    options: {
      interaction: { mode: "nearest", intersect: false },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 12 } }, y: valueAxis() },
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${m.fmt(c.parsed.y)}` } },
      },
    },
  });
}

function renderPlayersChart(rows, m) {
  const byPlayer = groupBy(rows, (r) => r.playerID);
  const names = new Map(rows.map((r) => [r.playerID, r.name]));
  let entries = [...byPlayer.entries()];
  let note;
  let calc = m.calc;
  let label = m.label;
  let format = m.fmt;
  if (m.rate) {
    entries = entries.filter(([, a]) => a.AB >= PLAYER_RATE_MIN_AB);
    note = `Players with at least ${fmt.int(PLAYER_RATE_MIN_AB)} at-bats in the current view.`;
  } else if (state.measure === "players") {
    calc = (a) => a.rows;
    label = "Player-season rows";
    format = fmt.int;
    note = "For the Players measure this chart ranks players by how many rows (team-seasons) they have in the view.";
  } else if (state.measure === "medhr") {
    entries = entries.filter(([, a]) => a.rows >= PLAYER_MEDIAN_MIN_ROWS);
    note = `Players with at least ${PLAYER_MEDIAN_MIN_ROWS} rows in the current view.`;
  } else {
    note = "Totals over every row in the current view.";
  }
  const top = entries
    .map(([id, a]) => ({ name: names.get(id), v: calc(a) }))
    .filter((e) => isFinite(e.v))
    .sort((a, b) => b.v - a.v)
    .slice(0, 10);
  document.getElementById("t-players").textContent = `Top 10 players: ${label.toLowerCase()}`;
  document.getElementById("n-players").textContent = top.length ? note : `${note} No players qualify.`;
  setChart("c-players", {
    type: "bar",
    data: {
      labels: top.map((e) => e.name),
      datasets: [{ label, data: top.map((e) => e.v), backgroundColor: top.map((_, i) => (i === 0 ? COLORS.red : COLORS.gold)), borderRadius: 2 }],
    },
    options: {
      indexAxis: "y",
      scales: {
        x: valueAxis(true),
        y: { grid: { display: false }, ticks: { autoSkip: false } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${label}: ${format(c.parsed.x)}` } } },
    },
  });
}

function renderTable(groups, keys, all, m, bd) {
  const cols = [
    ["Rows", (a) => fmt.int(a.rows)],
    ["Players", (a) => fmt.int(a.players.size)],
    ["AB", (a) => fmt.int(a.AB)],
    ["H", (a) => fmt.int(a.H)],
    ["HR", (a) => fmt.int(a.HR)],
    ["3B", (a) => fmt.int(a.T)],
    ["SO", (a) => fmt.int(a.SO)],
    ["AVG", (a) => (a.AB ? fmt.avg(a.H / a.AB) : "–")],
    ["HR/100 AB", (a) => (a.AB ? fmt.d2((100 * a.HR) / a.AB) : "–")],
    ["SO/100 AB", (a) => (a.AB ? fmt.d1((100 * a.SO) / a.AB) : "–")],
    ["3B/1,000 AB", (a) => (a.AB ? fmt.d2((1000 * a.T) / a.AB) : "–")],
    ["Median HR", (a) => MEASURES.medhr.fmt(median(a.hrList))],
  ];
  const highlight = { avg: "AVG", hrr: "HR/100 AB", sor: "SO/100 AB", tr: "3B/1,000 AB", hr: "HR", h: "H", players: "Players", medhr: "Median HR" }[state.measure];
  const table = document.getElementById("table");
  document.getElementById("t-table").textContent = `Numbers behind the current view, by ${bd.label.toLowerCase()}`;
  const th = (c) => `<th${c === highlight ? ' style="background: var(--red)"' : ""}>${c}</th>`;
  table.querySelector("thead").innerHTML = `<tr><th>${bd.label}</th>${cols.map(([c]) => th(c)).join("")}</tr>`;
  const row = (name, a, bold) =>
    `<tr${bold ? ' style="font-weight:700"' : ""}><td>${name}</td>${cols.map(([, f]) => `<td>${f(a)}</td>`).join("")}</tr>`;
  table.querySelector("tbody").innerHTML =
    keys.map((k) => row(k, groups.get(k))).join("") + row("All rows in view", all, true);
}

function render() {
  syncSwitches();
  const rows = filtered();
  const m = MEASURES[state.measure];
  const bd = BREAKDOWNS[state.breakdown];
  const all = emptyAgg();
  rows.forEach((r) => add(all, r));
  const groups = groupBy(rows, bd.key);
  const keys = orderedGroups(groups, bd);
  const years = seasonRange(rows);

  renderSummary(rows, all);
  renderGroupChart(groups, keys, m, bd);
  renderTrendChart(rows, years, m);
  renderSplitChart(rows, years, groups, keys, m, bd);
  renderPlayersChart(rows, m);
  renderTable(groups, keys, all, m, bd);
}

// ---------- start ----------

buildSwitch("sw-measure", MEASURES, "measure");
buildSwitch("sw-break", BREAKDOWNS, "breakdown");

Papa.parse("data/batting.csv", {
  download: true,
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
  complete: (res) => {
    ROWS = prepare(res.data);
    buildFilterOptions();
    resetFilters();
    Object.values(F).forEach((el) => el.addEventListener("change", render));
    document.getElementById("reset").addEventListener("click", () => {
      resetFilters();
      render();
    });
    render();
  },
  error: (err) => {
    document.getElementById("status").textContent =
      `Could not load data/batting.csv (${err.message || err}). Open this page through a web server, not as a local file.`;
  },
});
