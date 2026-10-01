# /// script
# requires-python = ">=3.10"
# dependencies = ["pandas"]
# ///
"""Compute every number shown on the report page.

Reads data/batting.csv (built by prepare_data.py) and writes
data/findings.json, which index.html loads for its headline numbers,
text figures, and charts.

Definitions used throughout
- All rates are ratios of totals, not averages of player rates:
    batting average  = sum(H)  / sum(AB)
    home-run rate    = sum(HR) / sum(AB)
    strikeout rate   = sum(SO) / sum(AB)
    triples rate     = sum(3B) / sum(AB)
  Rates "per 100 AB" or "per 1,000 AB" are the same ratio scaled.
- Values are stored to 6 decimals; the pages round them only for display.
- A "regular hitter" row has at least 300 AB with one team (used only
  for the handedness comparison, so pitchers batting do not skew it).
- A player counts once per season for player counts, even if he played
  for more than one team that season.
- Foreign-born = birthCountry is not "USA". Two rows with no birth
  country are left out of that finding only.

Run with:  uv run scripts/analysis.py
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "batting.csv"
OUT = ROOT / "data" / "findings.json"
RAW_BATTING = ROOT / "data" / "raw" / "Batting.csv"

REGULAR_AB = 300
ERAS = [  # label, first season, last season
    ("Dead Ball", 1901, 1919),
    ("Live Ball", 1920, 1941),
    ("Integration", 1942, 1960),
    ("Expansion", 1961, 1976),
    ("Free Agency", 1977, 1993),
    ("Steroid", 1994, 2005),
    ("Modern", 2006, 2025),
]


def era_of(year: int) -> str:
    return next(label for label, lo, hi in ERAS if lo <= year <= hi)


def by_year(df: pd.DataFrame) -> pd.DataFrame:
    return df.groupby("yearID")[["AB", "H", "HR", "3B", "SO"]].sum()


def main() -> None:
    df = pd.read_csv(DATA)
    df["era"] = df["yearID"].map(era_of)
    raw = pd.read_csv(RAW_BATTING, usecols=["yearID", "lgID"])
    al_nl = raw["lgID"].isin(["AL", "NL"])
    dropped = {
        "source_rows": int(len(raw)),
        "kept_rows": int(len(df)),
        "other_league_rows": int((~al_nl).sum()),
        "pre1901_al_nl_rows": int((al_nl & (raw["yearID"] < 1901)).sum()),
    }
    yr = by_year(df)
    years = [int(y) for y in yr.index]

    def era_table(col: str, scale: float, digits: int) -> list[dict]:
        e = df.groupby("era")[["AB", col]].sum()
        return [
            {"era": label, "years": f"{lo}-{hi}", "value": round(float(e.loc[label, col] / e.loc[label, "AB"] * scale), digits)}
            for label, lo, hi in ERAS
        ]

    # 1. Home-run rate
    hr_per100 = yr["HR"] / yr["AB"] * 100
    f_hr = {
        "years": years,
        "hr_per_100ab": [round(float(v), 6) for v in hr_per100],
        "by_era": era_table("HR", 100, 6),
        "first": {"year": years[0], "value": round(float(hr_per100.iloc[0]), 6)},
        "last": {"year": years[-1], "value": round(float(hr_per100.iloc[-1]), 6)},
        "peak": {"year": int(hr_per100.idxmax()), "value": round(float(hr_per100.max()), 6)},
        "peak_pre1994": {"year": int(hr_per100.loc[:1993].idxmax()), "value": round(float(hr_per100.loc[:1993].max()), 6)},
        "max_steroid": {"year": int(hr_per100.loc[1994:2005].idxmax()), "value": round(float(hr_per100.loc[1994:2005].max()), 6)},
    }

    # 2. Strikeout rate
    so_per100 = yr["SO"] / yr["AB"] * 100
    f_so = {
        "years": years,
        "so_per_100ab": [round(float(v), 6) for v in so_per100],
        "by_era": era_table("SO", 100, 6),
        "first": {"year": years[0], "value": round(float(so_per100.iloc[0]), 6)},
        "last": {"year": years[-1], "value": round(float(so_per100.iloc[-1]), 6)},
        "peak": {"year": int(so_per100.idxmax()), "value": round(float(so_per100.max()), 6)},
        "low": {"year": int(so_per100.idxmin()), "value": round(float(so_per100.min()), 6)},
        "years_rising_since_2005": int((so_per100.loc[2006:].diff().dropna() > 0).sum() + (so_per100.loc[2006] > so_per100.loc[2005])),
    }

    # 3. Batting average
    avg = yr["H"] / yr["AB"]
    f_avg = {
        "years": years,
        "avg": [round(float(v), 6) for v in avg],
        "by_era": era_table("H", 1, 6),
        "high": {"year": int(avg.idxmax()), "value": round(float(avg.max()), 6)},
        "low": {"year": int(avg.idxmin()), "value": round(float(avg.min()), 6)},
        "last": {"year": years[-1], "value": round(float(avg.iloc[-1]), 6)},
        "after_low": {"year": int(avg.idxmin()) + 1, "value": round(float(avg.loc[avg.idxmin() + 1]), 6)},
        "lowest5_last50": [{"year": int(y), "value": round(float(v), 6)} for y, v in avg.loc[years[-1] - 49:].nsmallest(5).items()],
    }

    # 5. Franchise home runs
    fr = (
        df.groupby(["franchID", "franchName"])[["HR", "AB"]].sum()
        .reset_index().sort_values("HR", ascending=False)
    )
    fr["hr_per_100ab"] = (fr["HR"] / fr["AB"] * 100).round(6)
    f_fr = {
        "franchises": [
            {"franchID": r.franchID, "name": r.franchName, "hr": int(r.HR), "ab": int(r.AB), "hr_per_100ab": float(r.hr_per_100ab)}
            for r in fr.itertuples()
        ],
        "seasons_by_franchise": {k: int(v) for k, v in df.groupby("franchID")["yearID"].nunique().items()},
        "original_franchises": int((df.groupby("franchID")["yearID"].min() == years[0]).sum()),
        "originals_hold_top_spots": bool(
            set(fr["franchID"].head(int((df.groupby("franchID")["yearID"].min() == years[0]).sum())))
            == set(df.loc[df["yearID"] == years[0], "franchID"])
        ),
    }

    # 6. Handedness among regular hitters
    reg = df[(df["AB"] >= REGULAR_AB) & df["bats"].notna()]
    h = reg.groupby("bats")[["AB", "H", "HR", "SO"]].sum()
    h_rows = reg.groupby("bats").size()
    labels = {"L": "Left", "R": "Right", "B": "Switch"}
    left_share = reg[reg["bats"] == "L"].groupby("yearID")["AB"].sum() / reg.groupby("yearID")["AB"].sum()
    f_hand = {
        "min_ab": REGULAR_AB,
        "groups": [
            {"bats": b, "label": labels[b], "rows": int(h_rows[b]), "ab": int(h.loc[b, "AB"]),
             "avg": round(float(h.loc[b, "H"] / h.loc[b, "AB"]), 6),
             "hr_per_100ab": round(float(h.loc[b, "HR"] / h.loc[b, "AB"] * 100), 6),
             "so_per_100ab": round(float(h.loc[b, "SO"] / h.loc[b, "AB"] * 100), 6)}
            for b in ["L", "R", "B"]
        ],
        "regular_rows": int(len(reg)),
        "left_ab_share_by_era": [
            {"era": label, "value": round(float(
                reg[(reg.era == label) & (reg.bats == "L")]["AB"].sum() / reg[reg.era == label]["AB"].sum()), 6)}
            for label, _, _ in ERAS
        ],
        "left_ab_share_years": [int(y) for y in left_share.index],
        "left_ab_share": [round(float(v), 6) for v in left_share],
    }

    # 7. Foreign-born players
    players = df[df["birthCountry"].notna()].drop_duplicates(["yearID", "playerID"])
    players = players.assign(foreign=players["birthCountry"] != "USA")
    share = players.groupby("yearID")["foreign"].mean()
    latest = players[players["yearID"] == years[-1]]
    top_latest = latest[latest.foreign]["birthCountry"].value_counts().head(8)
    alltime = players.drop_duplicates("playerID")
    top_alltime = alltime[alltime["birthCountry"] != "USA"]["birthCountry"].value_counts().head(8)
    f_foreign = {
        "years": [int(y) for y in share.index],
        "share": [round(float(v), 6) for v in share],
        "first": {"year": int(share.index[0]), "value": round(float(share.iloc[0]), 6)},
        "last": {"year": int(share.index[-1]), "value": round(float(share.iloc[-1]), 6),
                 "players": int(len(latest)), "foreign_players": int(latest.foreign.sum())},
        "countries_latest": int(latest[latest.foreign]["birthCountry"].nunique()),
        "top_countries_latest": [{"country": c, "players": int(n)} for c, n in top_latest.items()],
        "top_countries_alltime": [{"country": c, "players": int(n)} for c, n in top_alltime.items()],
        "share_1960": round(float(share.loc[1960]), 6),
        "share_1990": round(float(share.loc[1990]), 6),
    }

    # 10. Triples vs home runs
    tr_per1000 = yr["3B"] / yr["AB"] * 1000
    hr_per1000 = yr["HR"] / yr["AB"] * 1000
    hr_ahead = yr["HR"] > yr["3B"]
    first_cross = int(hr_ahead.idxmax())
    for_good = int(hr_ahead[~hr_ahead].index.max() + 1)  # the season after the last year triples led
    f_triples = {
        "years": years,
        "triples_per_1000ab": [round(float(v), 6) for v in tr_per1000],
        "hr_per_1000ab": [round(float(v), 6) for v in hr_per1000],
        "first": {"year": years[0], "triples": int(yr["3B"].iloc[0]), "hr": int(yr["HR"].iloc[0]),
                  "value": round(float(tr_per1000.iloc[0]), 6)},
        "last": {"year": years[-1], "triples": int(yr["3B"].iloc[-1]), "hr": int(yr["HR"].iloc[-1]),
                 "value": round(float(tr_per1000.iloc[-1]), 6)},
        "hr_first_pass_triples_year": first_cross,
        "hr_pass_triples_for_good_year": for_good,
        "triples_led_again": [int(y) for y in hr_ahead[~hr_ahead].index if y > first_cross],
        "hr_to_triples_last": round(float(yr["HR"].iloc[-1] / yr["3B"].iloc[-1]), 6),
    }

    # 11. AL vs NL and the designated hitter
    lg = df.groupby(["yearID", "lgID"])[["AB", "H", "HR"]].sum()
    lg_avg = (lg["H"] / lg["AB"]).unstack()
    lg_hr = (lg["HR"] / lg["AB"] * 100).unstack()
    gap_avg = (lg_avg["AL"] - lg_avg["NL"]) * 1000  # points of batting average
    periods = [("Before the DH", 1901, 1972), ("AL-only DH", 1973, 2021), ("Universal DH", 2022, 2025)]

    def period_gap(lo: int, hi: int) -> dict:
        sub = lg.loc[lo:hi].groupby("lgID").sum()
        a = sub["H"] / sub["AB"]
        r = sub["HR"] / sub["AB"] * 100
        return {"al_avg": round(float(a["AL"]), 6), "nl_avg": round(float(a["NL"]), 6),
                "avg_gap_points": round(float((a["AL"] - a["NL"]) * 1000), 6),
                "al_hr": round(float(r["AL"]), 6), "nl_hr": round(float(r["NL"]), 6)}

    f_league = {
        "years": years,
        "al_avg": [round(float(v), 6) for v in lg_avg["AL"]],
        "nl_avg": [round(float(v), 6) for v in lg_avg["NL"]],
        "al_hr_per_100ab": [round(float(v), 6) for v in lg_hr["AL"]],
        "nl_hr_per_100ab": [round(float(v), 6) for v in lg_hr["NL"]],
        "avg_gap_points": [round(float(v), 6) for v in gap_avg],
        "periods": [{"label": label, "years": f"{lo}-{hi}", **period_gap(lo, hi)} for label, lo, hi in periods],
        "al_higher_years_1973_2021": int((gap_avg.loc[1973:2021] > 0).sum()),
        "al_higher_years_1901_1972": int((gap_avg.loc[1901:1972] > 0).sum()),
    }

    headline = {
        "rows": int(len(df)),
        "seasons": len(years),
        "players": int(df["playerID"].nunique()),
        "total_hr": int(df["HR"].sum()),
        "total_hits": int(df["H"].sum()),
        "hr_rate_change": round(f_hr["last"]["value"] / f_hr["first"]["value"], 6),
        "so_rate_change": round(f_so["last"]["value"] / f_so["first"]["value"], 6),
        "foreign_share_last": f_foreign["last"]["value"],
    }

    findings = {
        "eras": [{"era": label, "first": lo, "last": hi} for label, lo, hi in ERAS],
        "headline": headline,
        "dropped": dropped,
        "home_runs": f_hr,
        "strikeouts": f_so,
        "batting_average": f_avg,
        "franchises": f_fr,
        "handedness": f_hand,
        "foreign_born": f_foreign,
        "triples": f_triples,
        "leagues": f_league,
    }
    OUT.write_text(json.dumps(findings, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
