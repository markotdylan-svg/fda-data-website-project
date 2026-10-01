// Report page: load data/findings.json, fill every [data-k] number, draw the eight charts.

function lookup(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function fillNumbers(f) {
  document.querySelectorAll("[data-k]").forEach((el) => {
    const v = lookup(f, el.dataset.k);
    if (v === undefined) {
      console.warn("missing value for", el.dataset.k);
      el.textContent = "?";
      return;
    }
    const format = fmt[el.dataset.f];
    el.textContent = format ? format(v) : v;
  });
}

const yearAxis = {
  ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14 },
  grid: { display: false },
};

function lineChart(id, years, datasets, yOpts, extra = {}) {
  return new Chart(document.getElementById(id), {
    type: "line",
    data: { labels: years, datasets },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: { x: yearAxis, y: yOpts },
      plugins: {
        legend: { display: datasets.length > 1, position: "bottom" },
        eraBands: { show: true },
        ...extra,
      },
    },
  });
}

function drawCharts(f) {
  // 1. Home-run rate
  lineChart("chart-hr", f.home_runs.years,
    [{ label: "HR per 100 AB", data: f.home_runs.hr_per_100ab, borderColor: COLORS.red, backgroundColor: COLORS.red }],
    { beginAtZero: true, title: { display: true, text: "Home runs per 100 at-bats" } });

  // 2. Strikeout rate
  lineChart("chart-so", f.strikeouts.years,
    [{ label: "SO per 100 AB", data: f.strikeouts.so_per_100ab, borderColor: COLORS.navy, backgroundColor: COLORS.navy }],
    { beginAtZero: true, title: { display: true, text: "Strikeouts per 100 at-bats" } });

  // 3. Batting average
  lineChart("chart-avg", f.batting_average.years,
    [{ label: "Batting average", data: f.batting_average.avg, borderColor: COLORS.green, backgroundColor: COLORS.green }],
    { title: { display: true, text: "Batting average" }, ticks: { callback: (v) => fmt.avg(v) } },
    {
      tooltip: { callbacks: { label: (c) => `Batting average: ${fmt.avg(c.parsed.y)}` } },
      markers: { lines: [
        { x: f.batting_average.high.year, label: `${f.batting_average.high.year}: ${fmt.avg(f.batting_average.high.value)}` },
        { x: f.batting_average.low.year, label: `${f.batting_average.low.year}: ${fmt.avg(f.batting_average.low.value)}` },
      ] },
    });

  // 4. Franchise home runs (horizontal bars, highest first)
  const fr = f.franchises.franchises;
  new Chart(document.getElementById("chart-fr"), {
    type: "bar",
    data: {
      labels: fr.map((x) => x.name),
      datasets: [{
        label: "Home runs",
        data: fr.map((x) => x.hr),
        backgroundColor: fr.map((x, i) => (i === 0 ? COLORS.red : COLORS.navy)),
        borderRadius: 2,
      }],
    },
    options: {
      indexAxis: "y",
      scales: {
        x: { beginAtZero: true, ticks: { callback: (v) => fmt.int(v) } },
        y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 12 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${fmt.int(c.parsed.x)} home runs (${f.franchises.seasons_by_franchise[fr[c.dataIndex].franchID]} seasons)` } },
      },
    },
  });

  // 5. Handedness: batting average (left axis) and HR rate (right axis)
  const g = f.handedness.groups;
  new Chart(document.getElementById("chart-hand"), {
    type: "bar",
    data: {
      labels: g.map((x) => `${x.label}-handed`.replace("Switch-handed", "Switch hitters")),
      datasets: [
        { label: "Batting average", data: g.map((x) => x.avg), backgroundColor: COLORS.navy, yAxisID: "y" },
        { label: "HR per 100 AB", data: g.map((x) => x.hr_per_100ab), backgroundColor: COLORS.red, yAxisID: "y1" },
      ],
    },
    options: {
      scales: {
        x: { grid: { display: false } },
        y: { min: 0.25, max: 0.29, position: "left", title: { display: true, text: "Batting average" }, ticks: { callback: (v) => fmt.avg(v) } },
        y1: { min: 0, max: 3, position: "right", grid: { display: false }, title: { display: true, text: "HR per 100 at-bats" } },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (c) => (c.datasetIndex === 0 ? `Batting average: ${fmt.avg(c.parsed.y)}` : `HR per 100 AB: ${fmt.d2(c.parsed.y)}`) } },
      },
    },
  });

  // 6. Foreign-born share
  lineChart("chart-foreign", f.foreign_born.years,
    [{
      label: "Foreign-born share", data: f.foreign_born.share, borderColor: COLORS.gold,
      backgroundColor: "rgba(201, 154, 46, 0.18)", fill: true,
    }],
    { beginAtZero: true, title: { display: true, text: "Share of players" }, ticks: { callback: (v) => Math.round(v * 100) + "%" } },
    { tooltip: { callbacks: { label: (c) => `Born outside the U.S.: ${fmt.pct(c.parsed.y)}` } } });

  // 7. Triples vs home runs
  lineChart("chart-triples", f.triples.years,
    [
      { label: "Triples per 1,000 AB", data: f.triples.triples_per_1000ab, borderColor: COLORS.navy, backgroundColor: COLORS.navy },
      { label: "Home runs per 1,000 AB", data: f.triples.hr_per_1000ab, borderColor: COLORS.red, backgroundColor: COLORS.red },
    ],
    { beginAtZero: true, title: { display: true, text: "Per 1,000 at-bats" } },
    { markers: { lines: [{ x: f.triples.hr_pass_triples_for_good_year, label: `HR lead for good from ${f.triples.hr_pass_triples_for_good_year}` }] } });

  // 8. AL minus NL batting average
  const gap = f.leagues.avg_gap_points;
  new Chart(document.getElementById("chart-lg"), {
    type: "bar",
    data: {
      labels: f.leagues.years,
      datasets: [{
        label: "AL − NL (points)",
        data: gap,
        backgroundColor: gap.map((v) => (v >= 0 ? COLORS.red : COLORS.navy)),
        categoryPercentage: 1,
        barPercentage: 0.85,
      }],
    },
    options: {
      scales: { x: yearAxis, y: { title: { display: true, text: "AL minus NL batting average (points)" } } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const i = c.dataIndex;
              return [`AL ${fmt.avg(f.leagues.al_avg[i])} · NL ${fmt.avg(f.leagues.nl_avg[i])}`,
                `Gap: ${c.parsed.y > 0 ? "+" : ""}${fmt.d1(c.parsed.y)} points`];
            },
          },
        },
        markers: { lines: [{ x: 1973, label: "AL adds DH" }, { x: 2022, label: "Universal DH", align: "right" }] },
      },
    },
  });
}

fetch("data/findings.json")
  .then((r) => {
    if (!r.ok) throw new Error(`findings.json: HTTP ${r.status}`);
    return r.json();
  })
  .then((f) => {
    fillNumbers(f);
    drawCharts(f);
  })
  .catch((err) => {
    console.error(err);
    document.querySelector(".summary").insertAdjacentHTML("afterend",
      '<p class="status">Could not load data/findings.json. Open this page through a web server (GitHub Pages or <code>python -m http.server</code>), not as a local file.</p>');
  });
