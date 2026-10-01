# Box Score Century

A two-page data website about 125 years of American League and National League
hitting (1901–2025), built by Dylan Marko for the Financial Data Analytics Data
Website Project.

- **Live site:** https://markotdylan-svg.github.io/fda-data-website-project/
- **Report** (`index.html`): eight findings, each with the numbers behind it and a chart,
  plus headline numbers and a section explaining the data.
- **Dashboard** (`dashboard.html`): loads the full data set in the browser, with filters,
  summary numbers, four charts with measure and breakdown switches, a table, and a reset button.

## Data source

The [Lahman Baseball Database](https://sabr.org/lahman-database/), maintained by SABR
(2025 release, seasons 1871–2025). The SABR download link points to a Box folder that cannot be
fetched by a script, so `scripts/prepare_data.py` downloads the same release from the R package
[`Lahman` 14.0-0 on CRAN](https://cran.r-project.org/package=Lahman) and exports its tables to CSV.

One row of `data/batting.csv` is one player's batting totals for one team in one season. The
project keeps the 108,559 AL and NL rows from 1901–2025 and drops the 15,042 rows from other
leagues and the 4,997 National League rows from before 1901.

## Files

| File | What it does |
|---|---|
| `index.html` | Report page: title, summary, headline numbers, eight findings with charts, and the "About the data" section. |
| `dashboard.html` | Dashboard page: filters, summary numbers, measure/breakdown switches, four charts, data table, reset button. |
| `css/style.css` | Shared fonts, colors, navigation bar, and layout for both pages. |
| `js/theme.js` | Shared chart colors, era definitions, number formatting, and Chart.js plugins (era bands, marker lines). |
| `js/report.js` | Loads `data/findings.json`, fills in every number in the report text, and draws the eight report charts. |
| `js/dashboard.js` | Loads `data/batting.csv`, applies the filters, and computes and draws the dashboard numbers, charts, and table. |
| `data/batting.csv` | The project data set (108,559 rows × 29 columns), built by `prepare_data.py`. Used by the dashboard and the analysis script. |
| `data/findings.json` | Every number shown on the report page, computed by `analysis.py`. |
| `data/raw/Batting.csv` | Untouched Lahman Batting table (all leagues, 1871–2025). |
| `data/raw/People.csv` | Untouched Lahman People table (names, batting side, birth country). |
| `data/raw/Teams.csv` | Untouched Lahman Teams table (team names and franchise IDs by season). |
| `data/raw/TeamsFranchises.csv` | Untouched Lahman TeamsFranchises table (franchise IDs). |
| `scripts/prepare_data.py` | Downloads the Lahman release, saves the raw tables, filters to AL/NL 1901–2025, joins player and team details, and writes `data/batting.csv`. |
| `scripts/analysis.py` | Computes the report's findings from `data/batting.csv` and writes `data/findings.json`. Its docstring defines every rate. |
| `.gitignore` | Keeps the downloaded CRAN package and Python caches out of the repository. |
| `README.md` | This file. |

## Reproducing the numbers

The scripts need [uv](https://docs.astral.sh/uv/), which installs their dependencies (pandas, pyreadr) automatically.

```
uv run scripts/prepare_data.py   # rebuild data/batting.csv and data/raw/
uv run scripts/analysis.py       # rebuild data/findings.json
```

To view the site locally, serve the folder (the pages load data with `fetch`, which does not work from `file://`):

```
python -m http.server
```

then open http://localhost:8000.
