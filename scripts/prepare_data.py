# /// script
# requires-python = ">=3.10"
# dependencies = ["pandas", "pyreadr"]
# ///
"""Build the project data set from the Lahman Baseball Database.

Source: the R package `Lahman` on CRAN (version 14.0-0, Lahman database
2025 release, seasons 1871-2025). The SABR download page links to a Box
folder that cannot be fetched by script, so we take the same tables from
the CRAN package tarball.

Steps
1. Download the pinned CRAN tarball (skipped if already in data/raw/).
2. Export the Batting, People, Teams, and TeamsFranchises tables to CSV
   in data/raw/ so the untouched source tables are kept in the repo.
3. Keep American League and National League rows from 1901-2025.
4. Join player name and handedness (People), and team and franchise
   names (Teams, TeamsFranchises).
5. Write data/batting.csv, the one file the website uses.

Run with:  uv run scripts/prepare_data.py
"""

import tarfile
import urllib.request
import warnings
from pathlib import Path

import pandas as pd
import pyreadr

warnings.filterwarnings("ignore", category=RuntimeWarning)  # pyreadr date casts

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "batting.csv"

CRAN_VERSION = "14.0-0"
TARBALL_URL = f"https://cran.r-project.org/src/contrib/Archive/Lahman/Lahman_{CRAN_VERSION}.tar.gz"
TARBALL_URL_CURRENT = f"https://cran.r-project.org/src/contrib/Lahman_{CRAN_VERSION}.tar.gz"
TABLES = ["Batting", "People", "Teams", "TeamsFranchises"]

FIRST_YEAR, LAST_YEAR = 1901, 2025
LEAGUES = ["AL", "NL"]


def download_tarball() -> Path:
    path = RAW / f"Lahman_{CRAN_VERSION}.tar.gz"
    if path.exists():
        return path
    RAW.mkdir(parents=True, exist_ok=True)
    # The current release lives at the top level; older ones move to Archive/.
    for url in (TARBALL_URL_CURRENT, TARBALL_URL):
        try:
            urllib.request.urlretrieve(url, path)
            print(f"downloaded {url}")
            return path
        except Exception as err:  # noqa: BLE001
            print(f"could not download {url}: {err}")
    raise SystemExit("Lahman tarball not available from CRAN")


def load_tables(tarball: Path) -> dict[str, pd.DataFrame]:
    tables = {}
    with tarfile.open(tarball) as tar:
        for name in TABLES:
            member = f"Lahman/data/{name}.RData"
            tar.extract(member, RAW, filter="data")
            df = pyreadr.read_r(RAW / member)[name]
            for col in df.select_dtypes("category"):
                df[col] = df[col].astype(str)
            df.to_csv(RAW / f"{name}.csv", index=False)
            tables[name] = df
    return tables


def build(tables: dict[str, pd.DataFrame]) -> pd.DataFrame:
    bat = tables["Batting"]
    bat = bat[bat["lgID"].isin(LEAGUES) & bat["yearID"].between(FIRST_YEAR, LAST_YEAR)]

    people = tables["People"][["playerID", "nameFirst", "nameLast", "bats", "throws", "birthCountry"]]
    people = people.assign(playerName=people["nameFirst"].fillna("") + " " + people["nameLast"].fillna(""))
    people = people.drop(columns=["nameFirst", "nameLast"])

    teams = tables["Teams"][["yearID", "lgID", "teamID", "franchID", "name"]].rename(columns={"name": "teamName"})
    franchises = tables["TeamsFranchises"][["franchID", "franchName"]]

    df = (
        bat.merge(people, on="playerID", how="left", validate="many_to_one")
        .merge(teams, on=["yearID", "lgID", "teamID"], how="left", validate="many_to_one")
        .merge(franchises, on="franchID", how="left", validate="many_to_one")
    )
    df = df.rename(columns={"X2B": "2B", "X3B": "3B"})

    front = ["yearID", "playerID", "playerName", "stint", "teamID", "teamName", "franchID",
             "franchName", "lgID", "bats", "throws", "birthCountry"]
    df = df[front + [c for c in df.columns if c not in front]]
    return df.sort_values(["yearID", "teamID", "playerID", "stint"]).reset_index(drop=True)


def main() -> None:
    tables = load_tables(download_tarball())
    df = build(tables)
    df.to_csv(OUT, index=False)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(df):,} rows x {df.shape[1]} columns")
    print(f"seasons {df.yearID.min()}-{df.yearID.max()} ({df.yearID.nunique()}), "
          f"teams {df.teamID.nunique()}, franchises {df.franchID.nunique()}, players {df.playerID.nunique():,}")
    unmatched = df["teamName"].isna().sum() + df["franchName"].isna().sum()
    print(f"rows with no team/franchise match: {unmatched}")


if __name__ == "__main__":
    main()
