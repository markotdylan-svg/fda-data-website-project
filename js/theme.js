// Shared chart colors, Chart.js defaults, and number formatting for both pages.

const COLORS = {
  navy: "#13294b",
  red: "#b3262e",
  gold: "#c99a2e",
  green: "#2f6b4f",
  sky: "#5b85aa",
  brown: "#8a5a32",
  plum: "#7a4b78",
  ink: "#1c2541",
  inkSoft: "#4a5068",
  rule: "#cbbd98",
};

// Order used whenever a chart shows several groups at once.
const SERIES_COLORS = [
  COLORS.navy, COLORS.red, COLORS.gold, COLORS.green,
  COLORS.sky, COLORS.brown, COLORS.plum, "#3d3d3d",
];

const ERAS = [
  { era: "Dead Ball", first: 1901, last: 1919 },
  { era: "Live Ball", first: 1920, last: 1941 },
  { era: "Integration", first: 1942, last: 1960 },
  { era: "Expansion", first: 1961, last: 1976 },
  { era: "Free Agency", first: 1977, last: 1993 },
  { era: "Steroid", first: 1994, last: 2005 },
  { era: "Modern", first: 2006, last: 2025 },
];

function eraOf(year) {
  const e = ERAS.find((x) => year >= x.first && year <= x.last);
  return e ? e.era : "";
}

const fmt = {
  int: (v) => Math.round(v).toLocaleString("en-US"),
  avg: (v) => (isFinite(v) ? v.toFixed(3).replace(/^0/, "") : "–"),
  pct: (v) => (v * 100).toFixed(1) + "%",
  d1: (v) => v.toFixed(1),
  d2: (v) => v.toFixed(2),
  x: (v) => v.toFixed(1) + "×",
};

if (window.Chart) {
  Chart.defaults.font.family = '"Source Serif 4", Georgia, serif';
  Chart.defaults.font.size = 13;
  Chart.defaults.color = COLORS.inkSoft;
  Chart.defaults.borderColor = "rgba(203, 189, 152, 0.55)";
  Chart.defaults.plugins.legend.labels.boxWidth = 14;
  Chart.defaults.plugins.tooltip.backgroundColor = COLORS.navy;
  Chart.defaults.plugins.tooltip.titleFont = { family: '"Oswald", sans-serif', size: 13 };
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation.duration = 400;
  Chart.defaults.elements.line.borderWidth = 2.2;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 4;
}

// Plugin: shade alternating era bands behind a chart whose x axis is seasons.
// Turn on per chart with options.plugins.eraBands = { show: true }.
const eraBandsPlugin = {
  id: "eraBands",
  beforeDatasetsDraw(chart, _args, opts) {
    if (!opts || !opts.show) return;
    const x = chart.scales.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    const labels = chart.data.labels.map(Number);
    ctx.save();
    ERAS.forEach((e, i) => {
      const a = labels.indexOf(Math.max(e.first, labels[0]));
      const b = labels.indexOf(Math.min(e.last, labels[labels.length - 1]));
      if (a < 0 || b < 0) return;
      const x0 = x.getPixelForValue(a) - (a > 0 ? (x.getPixelForValue(a) - x.getPixelForValue(a - 1)) / 2 : 0);
      const x1 = x.getPixelForValue(b) + (b < labels.length - 1 ? (x.getPixelForValue(b + 1) - x.getPixelForValue(b)) / 2 : 0);
      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(201, 154, 46, 0.09)";
        ctx.fillRect(x0, top, x1 - x0, bottom - top);
      }
      ctx.fillStyle = "rgba(74, 80, 104, 0.75)";
      ctx.font = '11px "Oswald", sans-serif';
      ctx.textAlign = "center";
      if (x1 - x0 > 46) ctx.fillText(e.era.toUpperCase(), (x0 + x1) / 2, top + 12);
    });
    ctx.restore();
  },
};

// Plugin: vertical marker lines, e.g. options.plugins.markers = { lines: [{ x: 1973, label: "DH" }] }.
const markersPlugin = {
  id: "markers",
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || !opts.lines) return;
    const x = chart.scales.x;
    const { top, bottom } = chart.chartArea;
    const labels = chart.data.labels.map(Number);
    const ctx = chart.ctx;
    ctx.save();
    opts.lines.forEach((m) => {
      const i = labels.indexOf(m.x);
      if (i < 0) return;
      const px = x.getPixelForValue(i);
      ctx.strokeStyle = COLORS.red;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.red;
      ctx.font = '12px "Oswald", sans-serif';
      ctx.textAlign = m.align || "left";
      ctx.fillText(m.label, px + (m.align === "right" ? -5 : 5), top + 28);
    });
    ctx.restore();
  },
};

if (window.Chart) Chart.register(eraBandsPlugin, markersPlugin);
