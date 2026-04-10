# -*- coding: utf-8 -*-
"""
FX Converter GUI (CSV rates) - HTML UI via pywebview
Supports 2 sources:
- Mizuho Bank quote CSV (direct download)
- Mitsubishi (MURC) past FX pages (incremental crawling)

Enhancements:
- Source switch: mizuho / murc
- MURC rate basis selectable: TTM / TTS / TTB
- UI shows selected rate basis (accounting-friendly)
- Fix progress bar stuck at 0% even when already up to date:
  - Always call progress_cb(100) on early returns
  - API layer uses finally { progress_cb(100) } safety
- Avoid pywebview deep reflection issues by using __slots__ and storing paths as str
"""

import datetime as dt
import json
import os
import platform
import re
import sys
import time
from decimal import Decimal, ROUND_HALF_UP, ROUND_CEILING, ROUND_FLOOR
from pathlib import Path
from typing import Iterable, Optional, List, Dict, Any
from glob import glob
import pandas as pd
import webview


# -----------------------------
# Constants / helpers
# -----------------------------
MIZUHO_CSV_URL = "https://www.mizuhobank.co.jp/market/quote.csv"
MIZUHO_CACHE_MAX_AGE_HOURS = 24  # reuse cache within a day; manual refresh forces download
MIZUHO_MAX_DOWNLOADS_PER_DAY = 2  # hard limit: at most 2 server fetches per calendar day

# MURC
MURC_BASE = "https://www.murc-kawasesouba.jp/fx/past/index.php?id={id}"
MURC_SLEEP_SEC = 0.2
MURC_TIMEOUT_SEC = 30
MURC_CODE_RE = re.compile(r"^[A-Z]{3}$")
MURC_INITIAL_LOOKBACK_DAYS = 3650  # first time backfill (10 years)

MISSING_PAT = re.compile(r"^\s*(\*+|nan|NaN|None)?\s*$")
RESULT_ROUNDING_MODES = ("half_up", "up", "down")
RESULT_DECIMALS_MIN = 0
RESULT_DECIMALS_MAX = 8


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


CONFIG_PATH = app_dir() / "user_config.json"


def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def is_mizuho_cache_fresh(cache_path: Path) -> bool:
    if not cache_path.exists():
        return False
    try:
        stat = cache_path.stat()
        if stat.st_size <= 0:
            return False
        mtime = dt.datetime.fromtimestamp(stat.st_mtime)
        age = dt.datetime.now() - mtime
        return age.total_seconds() <= MIZUHO_CACHE_MAX_AGE_HOURS * 3600
    except Exception:
        return False


def is_missing(v) -> bool:
    if v is None:
        return True
    s = str(v).strip()
    return bool(MISSING_PAT.match(s))


def to_float_or_none(v):
    if is_missing(v):
        return None
    try:
        return float(str(v).strip())
    except Exception:
        return None


def parse_scale(code_or_col: str) -> int:
    s = str(code_or_col).upper()
    if "(100)" in s:
        return 100
    if s in ("KRW", "IDR"):
        return 100
    return 1


def normalize_date_str(s: str) -> str:
    s = str(s).strip()
    s = s.replace(".", "/").replace("-", "/")
    parts = s.split("/")
    if len(parts) != 3:
        raise ValueError("Date format should be YYYY-MM-DD or YYYY/MM/DD")
    y, m, d = map(int, parts)
    return f"{y:04d}-{m:02d}-{d:02d}"


# -----------------------------
# Mizuho download + parse
# -----------------------------
def _mizuho_download_count_today(log_path: Path) -> int:
    """Return how many times Mizuho CSV has been downloaded today."""
    try:
        if not log_path.exists():
            return 0
        data = json.loads(log_path.read_text(encoding="utf-8"))
        return data.get(dt.date.today().isoformat(), 0)
    except Exception:
        return 0


def _mizuho_increment_download_count(log_path: Path) -> None:
    """Increment today's Mizuho download count (keeps last 7 days only)."""
    try:
        data: dict = {}
        if log_path.exists():
            try:
                data = json.loads(log_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        cutoff = (dt.date.today() - dt.timedelta(days=7)).isoformat()
        data = {k: v for k, v in data.items() if k >= cutoff}
        today = dt.date.today().isoformat()
        data[today] = data.get(today, 0) + 1
        log_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def download_csv_to_cache(url: str, cache_path: Path, progress_cb=None,
                          log_path: Optional[Path] = None) -> str:
    import requests as _requests

    # --- Daily download limit check ---
    if log_path is not None:
        count_today = _mizuho_download_count_today(log_path)
        if count_today >= MIZUHO_MAX_DOWNLOADS_PER_DAY:
            if cache_path.exists():
                return str(cache_path)
            raise RuntimeError(
                f"本日のMizuhoダウンロード上限（{MIZUHO_MAX_DOWNLOADS_PER_DAY}回）に達しました。"
                f"明日再試行するか、手動でファイルを配置してください。"
            )

    ensure_dir(cache_path.parent)
    tmp_path = cache_path.with_suffix(cache_path.suffix + ".tmp")

    base_url = url.rsplit("/", 1)[0]
    referer = base_url + "/index.html"

    session = _requests.Session()
    # Full Chrome header set — including sec-ch-ua / sec-fetch-* which real browsers always send
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "Connection": "keep-alive",
    })

    # Prefetch the referrer page to acquire session cookies (helps bypass WAF bot detection)
    try:
        session.get(referer, timeout=10, headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        })
    except Exception:
        pass

    last_err = None
    for attempt in range(3):
        if attempt > 0:
            time.sleep(3 * attempt)
        try:
            with session.get(url, timeout=30, stream=True, headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": referer,
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "same-origin",
                "Upgrade-Insecure-Requests": "1",
            }) as resp:
                resp.raise_for_status()
                total_str = resp.headers.get("Content-Length")
                total = int(total_str) if total_str and total_str.isdigit() else None

                downloaded = 0
                chunk_size = 64 * 1024

                if progress_cb and not total:
                    progress_cb(20)

                with open(tmp_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=chunk_size):
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        if progress_cb and total:
                            pct = int(min(95, 5 + downloaded * 90 / total))
                            progress_cb(pct)

                if progress_cb and not total:
                    progress_cb(90)

            os.replace(tmp_path, cache_path)
            if log_path is not None:
                _mizuho_increment_download_count(log_path)
            return str(cache_path)
        except Exception as e:
            last_err = e
            continue

    # Fallback: try system curl (completely different TLS fingerprint from Python)
    try:
        import subprocess
        if progress_cb:
            progress_cb(30)
        subprocess.run(
            [
                "curl", "-fsSL",
                "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "-H", f"Referer: {referer}",
                "-H", "Accept-Language: ja,en-US;q=0.9,en;q=0.8",
                "-H", 'sec-ch-ua: "Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                "-H", "sec-ch-ua-mobile: ?0",
                "-H", 'sec-ch-ua-platform: "Windows"',
                "--connect-timeout", "15",
                "--max-time", "60",
                "-o", str(tmp_path),
                url,
            ],
            timeout=70,
            check=True,
        )
        if progress_cb:
            progress_cb(90)
        os.replace(tmp_path, cache_path)
        if log_path is not None:
            _mizuho_increment_download_count(log_path)
        return str(cache_path)
    except Exception:
        pass

    raise RuntimeError(
        f"Mizuhoサーバーからのダウンロードに失敗しました（requests×3回 + curl フォールバック）: {last_err}\n"
        f"ブラウザで {url} を開いて手動でダウンロードし、\n"
        f"以下のパスに保存してください: {cache_path}"
    )


def _read_csv_with_fallback(path: str, progress_cb=None, skiprows: int = 0, header: int = 0) -> pd.DataFrame:
    encodings = ["utf-8-sig", "cp932", "shift_jis", "utf-8", "gb18030"]
    last_err = None
    for enc in encodings:
        try:
            chunks = []
            file_size = os.path.getsize(path) if progress_cb else 0
            with open(path, "rb") as f:
                reader = pd.read_csv(
                    f,
                    chunksize=5000,
                    encoding=enc,
                    skiprows=skiprows,
                    header=header,
                )
                for chunk in reader:
                    chunks.append(chunk)
                    if progress_cb and file_size > 0:
                        pct = int(min(99, f.tell() * 99 / file_size))
                        progress_cb(pct)
            return pd.concat(chunks, ignore_index=True) if chunks else pd.DataFrame()
        except UnicodeDecodeError as e:
            last_err = e
            continue
    if last_err:
        raise last_err
    return pd.read_csv(path, skiprows=skiprows, header=header)


def load_rates_csv_wide(path: str, progress_cb=None, skiprows: int = 0):
    """
    Loads "wide" CSV: date column + currency columns.
    Returns df_rates(index=date, cols=currency_code), currencies list, meta
    """
    df = _read_csv_with_fallback(path, progress_cb=progress_cb, skiprows=skiprows, header=0)
    if df.shape[1] < 2:
        raise ValueError("CSV columns not enough. Need date column + at least one currency column.")

    date_col = df.columns[0]
    df = df.dropna(axis=1, how="all")
    cols = [c for c in df.columns if c != date_col]

    groups = {}
    for c in cols:
        base = c[:-2] if c.endswith(".1") else c
        groups.setdefault(base, []).append(c)

    dates = []
    for v in df[date_col].tolist():
        try:
            dates.append(pd.to_datetime(normalize_date_str(v)).date())
        except Exception:
            dates.append(None)

    df["_date_"] = dates
    df = df.dropna(subset=["_date_"])
    df = df.sort_values("_date_").reset_index(drop=True)

    merged = {}
    meta = {}
    for base, col_list in groups.items():
        col_list_sorted = sorted(col_list, key=lambda x: (0 if x == base else 1, x))

        series = []
        for _, row in df.iterrows():
            val = None
            for c in col_list_sorted:
                vv = to_float_or_none(row.get(c))
                if vv is not None:
                    val = vv
                    break
            series.append(val)

        merged[base] = series
        meta[base] = {"raw_cols": col_list_sorted, "scale": parse_scale(base)}

    df_rates = pd.DataFrame(merged)
    df_rates.insert(0, "_date_", df["_date_"].tolist())
    df_rates = df_rates.set_index("_date_")

    for c in df_rates.columns:
        df_rates[c] = pd.to_numeric(df_rates[c], errors="coerce")

    currencies = ["JPY"] + sorted(df_rates.columns.tolist())
    if progress_cb:
        progress_cb(100)
    return df_rates, currencies, meta


# -----------------------------
# MURC incremental crawler + pivot
# -----------------------------
def _murc_yymmdd(d: dt.date) -> str:
    return d.strftime("%y%m%d")


def _murc_parse_float(s: str) -> Optional[float]:
    s = (s or "").strip()
    if not s or s.lower() == "unquoted":
        return None
    s = s.replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _murc_extract_table_rows(html: str, date_iso: str) -> List[Dict[str, Any]]:
    try:
        from bs4 import BeautifulSoup
    except Exception as e:
        raise RuntimeError("Missing bs4. Please: pip install beautifulsoup4 lxml") from e

    soup = BeautifulSoup(html, "lxml")
    table = soup.select_one("table.data-table7")
    if not table:
        return []

    trs = table.select("tr")
    if len(trs) < 2:
        return []

    out: List[Dict[str, Any]] = []
    for tr in trs[1:]:
        tds = [td.get_text(strip=True) for td in tr.select("td")]

        if not tds or all(x == "" for x in tds):
            continue
        if len(tds) < 6:
            continue

        currency_en, currency_jp, code, tts_s, ttb_s, note = tds[:6]
        code = (code or "").strip().upper()
        if not MURC_CODE_RE.match(code):
            continue

        tts = _murc_parse_float(tts_s)
        ttb = _murc_parse_float(ttb_s)
        ttm = None
        if (tts is not None) and (ttb is not None):
            ttm = (tts + ttb) / 2

        out.append(
            {
                "date": date_iso,
                "currency_en": currency_en,
                "currency_jp": currency_jp,
                "code": code,
                "tts": tts,
                "ttb": ttb,
                "ttm": ttm,
                "note_raw": note,
            }
        )
    return out


def _murc_clean_existing_blank_rows(df: pd.DataFrame) -> pd.DataFrame:
    df["code"] = df["code"].astype(str).str.strip().str.upper()
    mask = df["code"].apply(lambda x: bool(MURC_CODE_RE.match(x)))
    return df[mask].copy()


def _murc_ensure_old_ttm_once(df_old: pd.DataFrame) -> pd.DataFrame:
    if "ttm" in df_old.columns:
        return df_old
    tts = pd.to_numeric(df_old.get("tts"), errors="coerce")
    ttb = pd.to_numeric(df_old.get("ttb"), errors="coerce")
    df_old["ttm"] = (tts + ttb) / 2
    return df_old


def _murc_daterange(start: dt.date, end: dt.date):
    d = start
    while d <= end:
        yield d
        d += dt.timedelta(days=1)


def murc_update_incremental(
    csv_path: Path,
    state_file: Path,
    progress_cb=None,
    use_state_file: bool = True,
) -> int:
    """
    Incrementally update MURC long-format CSV.
    Returns number of fetched rows (pre-dedup).
    IMPORTANT: Always calls progress_cb(100) on early returns to avoid UI stuck at 0%.
    """
    try:
        import requests
    except Exception as e:
        raise RuntimeError("Missing requests. Please: pip install requests") from e

    ensure_dir(csv_path.parent)

    def read_last_date_from_state() -> Optional[dt.date]:
        if not state_file.exists():
            return None
        txt = state_file.read_text(encoding="utf-8").strip()
        if not txt:
            return None
        return dt.date.fromisoformat(txt)

    def write_last_date_to_state(d: dt.date) -> None:
        state_file.write_text(d.isoformat(), encoding="utf-8")

    def get_max_date_from_csv(p: Path) -> Optional[dt.date]:
        if not p.exists():
            return None
        try:
            df0 = pd.read_csv(str(p), usecols=["date"])
            return pd.to_datetime(df0["date"]).max().date()
        except Exception:
            return None

    today = dt.date.today()

    # decide start
    last_state = read_last_date_from_state() if use_state_file else None

    if last_state is not None:
        start = last_state + dt.timedelta(days=1)
    else:
        last_csv = get_max_date_from_csv(csv_path)
        if last_csv is not None:
            start = last_csv + dt.timedelta(days=1)
        else:
            start = today - dt.timedelta(days=MURC_INITIAL_LOOKBACK_DAYS)

    end = today

    if start > end:
        if progress_cb:
            progress_cb(100)
        return 0

    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0 (compatible; MurcIncremental/3.0)"})

    new_rows: List[Dict[str, Any]] = []

    total_days = (end - start).days + 1
    processed = 0

    for d in _murc_daterange(start, end):
        processed += 1

        # skip weekends
        if d.weekday() >= 5:
            if use_state_file:
                write_last_date_to_state(d)
            if progress_cb and total_days:
                progress_cb(int(min(99, processed * 99 / total_days)))
            continue

        url = MURC_BASE.format(id=_murc_yymmdd(d))
        try:
            r = sess.get(url, timeout=MURC_TIMEOUT_SEC)
        except Exception:
            time.sleep(2)
            continue

        r.encoding = "cp932"
        rows = _murc_extract_table_rows(r.text, d.isoformat())
        if rows:
            new_rows.extend(rows)

        if use_state_file:
            write_last_date_to_state(d)

        if progress_cb and total_days:
            progress_cb(int(min(99, processed * 99 / total_days)))

        time.sleep(MURC_SLEEP_SEC)

    if not new_rows:
        if progress_cb:
            progress_cb(100)
        return 0

    # merge with old
    if csv_path.exists():
        df_old = pd.read_csv(str(csv_path))
        df_old = _murc_clean_existing_blank_rows(df_old)
        df_old = _murc_ensure_old_ttm_once(df_old)
    else:
        df_old = pd.DataFrame()

    df_new = pd.DataFrame(new_rows)
    df_all = pd.concat([df_old, df_new], ignore_index=True)

    df_all["date"] = pd.to_datetime(df_all["date"]).dt.date.astype(str)
    df_all["code"] = df_all["code"].astype(str).str.strip().str.upper()
    df_all = _murc_clean_existing_blank_rows(df_all)

    df_all = df_all.drop_duplicates(subset=["date", "code"], keep="last")
    df_all = df_all.sort_values(["date", "code"]).reset_index(drop=True)

    df_all.to_csv(str(csv_path), index=False, encoding="utf-8-sig")

    if progress_cb:
        progress_cb(100)
    return len(df_new)


def murc_load_rates_wide(murc_csv_path: Path, rate_basis: str) -> tuple[pd.DataFrame, list[str], dict]:
    """
    Read long-format MURC CSV and pivot to wide:
      index: date (dt.date)
      columns: code (USD/EUR/...)
      values: one of ttm / tts / ttb (selectable)
    """
    if not murc_csv_path.exists():
        raise FileNotFoundError(f"MURC CSV not found: {murc_csv_path}")

    rate_basis = str(rate_basis or "ttm").strip().lower()
    if rate_basis not in ("ttm", "tts", "ttb"):
        rate_basis = "ttm"

    df = pd.read_csv(str(murc_csv_path))
    if "date" not in df.columns or "code" not in df.columns:
        raise ValueError("MURC CSV missing required columns: date, code")
    if rate_basis not in df.columns:
        raise ValueError(f"MURC CSV missing rate column: {rate_basis}")

    df["code"] = df["code"].astype(str).str.strip().str.upper()
    df = _murc_clean_existing_blank_rows(df)

    df["date"] = pd.to_datetime(df["date"]).dt.date
    df[rate_basis] = pd.to_numeric(df[rate_basis], errors="coerce")

    wide = df.pivot_table(index="date", columns="code", values=rate_basis, aggfunc="last")
    wide = wide.sort_index()

    for c in wide.columns:
        wide[c] = pd.to_numeric(wide[c], errors="coerce")

    meta = {c: {"raw_cols": [c], "scale": parse_scale(c)} for c in wide.columns}
    currencies = ["JPY"] + sorted(list(wide.columns))
    return wide, currencies, meta


# -----------------------------
# Conversion engine
# -----------------------------
def find_best_date(df_rates: pd.DataFrame, target_date):
    if target_date in df_rates.index:
        return target_date
    prev_dates = [d for d in df_rates.index if d <= target_date]
    if not prev_dates:
        return None
    return max(prev_dates)


def get_jpy_per_unit(df_rates, currency: str, date_):
    if currency == "JPY":
        return 1.0, date_, 1

    used = find_best_date(df_rates, date_)
    if used is None:
        return None, None, None

    if currency not in df_rates.columns:
        return None, used, None

    all_dates = sorted([d for d in df_rates.index if d <= used], reverse=True)
    rate = None
    used_final = None
    for d in all_dates:
        r = df_rates.loc[d, currency]
        if not pd.isna(r):
            rate = float(r)
            used_final = d
            break

    if rate is None:
        return None, used, None

    scale = parse_scale(currency)
    jpy_per_1 = rate / float(scale)
    return jpy_per_1, used_final, scale


def convert_amount(df_rates, from_cur: str, to_cur: str, date_, amount: float):
    if from_cur == "JPY":
        amt_jpy = amount
        used_date_from = date_
        jpy_per_1_from = 1.0
    else:
        jpy_per_1_from, used_date_from, _ = get_jpy_per_unit(df_rates, from_cur, date_)
        if jpy_per_1_from is None:
            raise ValueError(f"No rate found for {from_cur} on/before {date_}.")
        amt_jpy = amount * jpy_per_1_from

    if to_cur == "JPY":
        used_date_to = date_
        jpy_per_1_to = 1.0
        result = amt_jpy
    else:
        jpy_per_1_to, used_date_to, _ = get_jpy_per_unit(df_rates, to_cur, date_)
        if jpy_per_1_to is None:
            raise ValueError(f"No rate found for {to_cur} on/before {date_}.")
        result = amt_jpy / jpy_per_1_to

    cross = jpy_per_1_from / jpy_per_1_to if (jpy_per_1_to and jpy_per_1_from) else None
    used_date = (
        min(used_date_from, used_date_to)
        if (used_date_from and used_date_to)
        else (used_date_from or used_date_to)
    )

    rate_info = (
        f"From rate: {from_cur} -> JPY = {jpy_per_1_from:.6f} (JPY per 1 {from_cur}) | Used date: {used_date_from}\n"
        f"To rate:   {to_cur}   -> JPY = {jpy_per_1_to:.6f} (JPY per 1 {to_cur}) | Used date: {used_date_to}\n"
        f"Cross: 1 {from_cur} = {cross:.8f} {to_cur}\n"
        f"(Conversion uses JPY pivot: {from_cur} -> JPY -> {to_cur})"
    )

    return {
        "result": result,
        "used_date": used_date,
        "jpy_per_1_from": jpy_per_1_from,
        "jpy_per_1_to": jpy_per_1_to,
        "cross": cross,
        "rate_info": rate_info,
        "used_date_from": used_date_from,
        "used_date_to": used_date_to,
    }


def parse_amount(s: str) -> float:
    s = str(s).strip().replace(",", "")
    if s == "":
        raise ValueError("Empty amount")
    return float(s)


def format_amount(n: float, decimals: int = 2) -> str:
    return f"{n:,.{decimals}f}"


def normalize_result_rounding(mode: Any) -> str:
    v = str(mode or "half_up").strip().lower()
    return v if v in RESULT_ROUNDING_MODES else "half_up"


def normalize_result_decimals(decimals: Any) -> int:
    try:
        n = int(str(decimals).strip())
    except Exception:
        n = 2
    if n < RESULT_DECIMALS_MIN:
        return RESULT_DECIMALS_MIN
    if n > RESULT_DECIMALS_MAX:
        return RESULT_DECIMALS_MAX
    return n


def round_result_value(value: float, decimals: int, mode: str) -> Decimal:
    rounding_map = {
        "half_up": ROUND_HALF_UP,
        "up": ROUND_CEILING,
        "down": ROUND_FLOOR,
    }
    q = Decimal("1").scaleb(-int(decimals))
    d = Decimal(str(value))
    return d.quantize(q, rounding=rounding_map[normalize_result_rounding(mode)])


def format_decimal_amount(n: Decimal, decimals: int = 2) -> str:
    return format(n, f",.{int(decimals)}f")


def safe_read_json(path: Path) -> dict:
    try:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def safe_write_json(path: Path, data: dict):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def resource_path(rel_path: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / rel_path


def load_ui_html() -> str:
    html_path = resource_path("ui/index.html")
    css_path = resource_path("ui/style.css")
    js_path = resource_path("ui/app.js")
    if not html_path.exists():
        raise FileNotFoundError(f"Missing UI file: {html_path}")
    html = html_path.read_text(encoding="utf-8")
    if css_path.exists():
        css = css_path.read_text(encoding="utf-8")
        html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
    if js_path.exists():
        js = js_path.read_text(encoding="utf-8")
        html = html.replace('<script src="app.js"></script>', f"<script>\n{js}\n</script>")
    return html


def _webview_arch_tag() -> str:
    machine = platform.machine().lower()
    if "arm" in machine:
        return "win-arm64"
    return "win-x64" if sys.maxsize > 2**32 else "win-x86"


def ensure_webview2_loader():
    arch = _webview_arch_tag()
    candidates = [
        Path(getattr(webview, "__file__", "")).resolve().parent / "lib" / "runtimes" / arch / "native",
        resource_path(f"webview/lib/runtimes/{arch}/native"),
    ]
    for p in candidates:
        if p and p.exists():
            try:
                os.add_dll_directory(str(p))
                return
            except Exception:
                pass


def ensure_webview2_user_data_dir():
    if not sys.platform.startswith("win"):
        return
    if os.environ.get("WEBVIEW2_USER_DATA_FOLDER"):
        return
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or str(Path.cwd())
    path = Path(base) / "FXConverter" / "WebView2"
    try:
        path.mkdir(parents=True, exist_ok=True)
        os.environ["WEBVIEW2_USER_DATA_FOLDER"] = str(path)
    except Exception:
        pass


def has_webview2_runtime() -> bool:
    if not sys.platform.startswith("win"):
        return False
    candidates = []
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles")):
        if not base:
            continue
        candidates.extend(
            glob(os.path.join(base, "Microsoft", "EdgeWebView", "Application", "*", "msedgewebview2.exe"))
        )
    if candidates:
        return True
    try:
        import winreg

        key_path = r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
        for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            try:
                with winreg.OpenKey(root, key_path) as key:
                    _ = winreg.QueryValueEx(key, "pv")
                    return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def warn_if_webview2_missing():
    if not sys.platform.startswith("win"):
        return
    if has_webview2_runtime():
        return
    try:
        import ctypes

        msg = (
            "WebView2 Runtime not found.\n"
            "The app may fail to start or fall back to an older engine.\n"
            "Download: https://developer.microsoft.com/microsoft-edge/webview2/"
        )
        ctypes.windll.user32.MessageBoxW(0, msg, "WebView2 Runtime Missing", 0x00000030)
    except Exception:
        pass


def pick_gui_backend() -> str:
    override = os.environ.get("FX_GUI_ENGINE") or os.environ.get("PYWEBVIEW_GUI")
    if override:
        return override.strip().lower()
    return "edgechromium" if has_webview2_runtime() else "mshtml"


# -----------------------------
# Web API
# -----------------------------
class FXWebAPI:
    __slots__ = (
        "df_rates",
        "currencies",
        "meta",
        "csv_path",
        "config",
        "source_id",
        "rate_basis",  # for murc: ttm/tts/ttb
        "result_rounding",  # half_up / up / down
        "result_decimals",  # 0..8
        "lang",
        "mizuho_url",
        "mizuho_cache_csv_path",
        "mizuho_download_log_path",
        "murc_csv_path",
        "murc_state_path",
    )

    def __init__(self):
        self.df_rates = None
        self.currencies = ["JPY"]
        self.meta = {}
        self.csv_path = ""
        self.config = safe_read_json(CONFIG_PATH)

        self.mizuho_url = MIZUHO_CSV_URL
        self.mizuho_cache_csv_path = str(app_dir() / "cache" / "mizuho_quote.csv")
        self.mizuho_download_log_path = str(app_dir() / "cache" / "mizuho_download_log.json")

        self.murc_csv_path = str(app_dir() / "cache" / "murc_kawase_daily.csv")
        self.murc_state_path = str(app_dir() / "cache" / "murc_last_date.txt")

        self.source_id = str(self.config.get("source_id") or "mizuho").strip().lower()
        if self.source_id not in ("mizuho", "murc"):
            self.source_id = "mizuho"

        self.rate_basis = str(self.config.get("rate_basis") or "ttm").strip().lower()
        if self.rate_basis not in ("ttm", "tts", "ttb"):
            self.rate_basis = "ttm"

        self.result_rounding = normalize_result_rounding(self.config.get("result_rounding"))
        self.result_decimals = normalize_result_decimals(self.config.get("result_decimals", 2))

        self.lang = str(self.config.get("lang") or "en").strip().lower()
        if self.lang not in ("en", "ja"):
            self.lang = "en"

    def _progress(self, pct: int):
        try:
            webview.windows[0].evaluate_js(f"setLoadProgress({int(pct)})")
        except Exception:
            pass

    def _rate_basis_label(self) -> str:
        # Accounting-friendly labels
        if self.source_id == "murc":
            return self.rate_basis.upper()
        return "MIZUHO"

    def _write_config(self, payload):
        recent = payload.get("recent_csv_paths", self.config.get("recent_csv_paths", []))
        data = {
            "source_id": payload.get("source_id", self.source_id),
            "rate_basis": payload.get("rate_basis", self.rate_basis),
            "result_rounding": payload.get("result_rounding", self.result_rounding),
            "result_decimals": payload.get("result_decimals", self.result_decimals),
            "lang": payload.get("lang", self.lang),
            "last_csv_path": payload.get("csv_path", ""),
            "from": payload.get("from", "JPY"),
            "to": payload.get("to", "USD"),
            "date_mode": payload.get("date_mode", "day"),
            "year": payload.get("year", ""),
            "month": payload.get("month", ""),
            "amount": payload.get("amount", ""),
            "day": payload.get("day", ""),
            "recent_csv_paths": recent,
        }
        self.source_id = str(data["source_id"] or "mizuho").lower()
        self.rate_basis = str(data["rate_basis"] or "ttm").lower()
        if self.rate_basis not in ("ttm", "tts", "ttb"):
            self.rate_basis = "ttm"
        self.result_rounding = normalize_result_rounding(data.get("result_rounding"))
        self.result_decimals = normalize_result_decimals(data.get("result_decimals", 2))
        data["result_rounding"] = self.result_rounding
        data["result_decimals"] = self.result_decimals
        self.lang = str(data.get("lang") or "en").lower()
        if self.lang not in ("en", "ja"):
            self.lang = "en"

        self.csv_path = data["last_csv_path"]
        self.config = data
        safe_write_json(CONFIG_PATH, data)

    def _apply_config(self, payload):
        cfg = self.config
        payload["source_id"] = str(cfg.get("source_id") or self.source_id)
        payload["rate_basis"] = str(cfg.get("rate_basis") or self.rate_basis)
        payload["result_rounding"] = normalize_result_rounding(cfg.get("result_rounding", self.result_rounding))
        payload["result_decimals"] = normalize_result_decimals(cfg.get("result_decimals", self.result_decimals))
        payload["lang"] = str(cfg.get("lang") or self.lang)
        payload["csv_path"] = cfg.get("last_csv_path", "")
        payload["from"] = cfg.get("from", "JPY")
        payload["to"] = cfg.get("to", "USD")
        payload["date_mode"] = cfg.get("date_mode", "day")
        payload["year"] = str(cfg.get("year") or "")
        payload["month"] = str(cfg.get("month") or "")
        payload["amount"] = str(cfg.get("amount") or "")
        payload["day"] = str(cfg.get("day") or "")
        payload["recent_csv_paths"] = cfg.get("recent_csv_paths", [])

    def _update_recent_paths(self, item: str) -> Iterable[str]:
        recent = self.config.get("recent_csv_paths", [])
        recent = [p for p in recent if p and p != item]
        recent.insert(0, item)
        return recent[:6]

    def _base_payload(self):
        payload = {
            "sources": [
                {"id": "mizuho", "label": "Mizuho (quote.csv)"},
                {"id": "murc", "label": "Mitsubishi (MURC)"},
            ],
            "murc_rate_bases": [
                {"id": "ttm", "label": "TTM (仲値/平均)"},
                {"id": "tts", "label": "TTS (Telegraphic Transfer Selling)"},
                {"id": "ttb", "label": "TTB (Telegraphic Transfer Buying)"},
            ],
            "source_id": self.source_id,
            "rate_basis": self.rate_basis,
            "result_rounding": self.result_rounding,
            "result_decimals": self.result_decimals,
            "lang": self.lang,
            "rate_basis_label": self._rate_basis_label(),
            "currencies": self.currencies,
            "months": [f"{i:02d}" for i in range(1, 13)],
        }
        if self.df_rates is not None:
            dates = sorted(self.df_rates.index)
            if dates:
                payload["min_date"] = str(dates[0])
                payload["max_date"] = str(dates[-1])
                payload["years"] = [str(y) for y in sorted({d.year for d in dates})]
        return payload

    def _load_mizuho(self, payload, autorender=False, force_download=False):
        def progress_cb(pct):
            self._progress(pct)

        try:
            progress_cb(1)
            cache_path = Path(self.mizuho_cache_csv_path)
            if not force_download and is_mizuho_cache_fresh(cache_path):
                local_path = str(cache_path)
                progress_cb(15)
            else:
                try:
                    local_path = download_csv_to_cache(
                        self.mizuho_url,
                        cache_path,
                        progress_cb=progress_cb,
                        log_path=Path(self.mizuho_download_log_path),
                    )
                except Exception as dl_err:
                    if cache_path.exists():
                        local_path = str(cache_path)
                    else:
                        raise RuntimeError(
                            f"Mizuhoサーバーからのダウンロードに失敗しました: {dl_err}\n"
                            f"手動でブラウザから {self.mizuho_url} を保存し、\n"
                            f"以下のパスに配置してください:\n{cache_path}"
                        ) from dl_err
            df_rates, currencies, meta = load_rates_csv_wide(local_path, progress_cb=progress_cb, skiprows=2)

            self.df_rates = df_rates
            self.currencies = currencies
            self.meta = meta
            self.source_id = "mizuho"

            self.csv_path = self.mizuho_url

            payload.update(self._base_payload())
            payload["csv_path"] = self.mizuho_url
            payload["source_id"] = "mizuho"
            payload["rate_basis_label"] = self._rate_basis_label()
            payload["autorender"] = autorender

            dates = sorted(self.df_rates.index)
            latest = dates[-1] if dates else None
            if latest:
                if not payload.get("day"):
                    payload["day"] = str(latest)
                if not payload.get("year"):
                    payload["year"] = str(latest.year)
                if not payload.get("month"):
                    payload["month"] = f"{latest.month:02d}"

            if payload.get("from") not in self.currencies:
                payload["from"] = "JPY"
            if payload.get("to") not in self.currencies:
                payload["to"] = "USD" if "USD" in self.currencies else "JPY"

            payload["recent_csv_paths"] = self._update_recent_paths("mizuho")
            self._write_config(payload)
            return payload
        finally:
            progress_cb(100)

    def _load_murc(self, payload, autorender=False, do_update=True):
        def progress_cb(pct):
            self._progress(pct)

        try:
            progress_cb(1)

            self.source_id = "murc"
            rb = str(payload.get("rate_basis") or self.rate_basis).strip().lower()
            if rb not in ("ttm", "tts", "ttb"):
                rb = self.rate_basis

            # optional update
            murc_new = 0
            if do_update:
                murc_new = murc_update_incremental(
                    csv_path=Path(self.murc_csv_path),
                    state_file=Path(self.murc_state_path),
                    progress_cb=progress_cb,
                    use_state_file=True,
                )
            else:
                # still ensure progress not stuck if user only switches basis
                progress_cb(60)

            # pivot to wide by selected rate basis
            df_rates, currencies, meta = murc_load_rates_wide(Path(self.murc_csv_path), rb)

            self.df_rates = df_rates
            self.currencies = currencies
            self.meta = meta

            self.rate_basis = rb

            if do_update:
                self.csv_path = f"MURC local DB ({murc_new} new rows)"
            else:
                self.csv_path = "MURC local DB"

            payload.update(self._base_payload())
            payload["csv_path"] = self.csv_path
            payload["source_id"] = "murc"
            payload["rate_basis"] = rb
            payload["rate_basis_label"] = self._rate_basis_label()
            payload["autorender"] = autorender

            dates = sorted(self.df_rates.index)
            latest = dates[-1] if dates else None
            if latest:
                if not payload.get("day"):
                    payload["day"] = str(latest)
                if not payload.get("year"):
                    payload["year"] = str(latest.year)
                if not payload.get("month"):
                    payload["month"] = f"{latest.month:02d}"

            if payload.get("from") not in self.currencies:
                payload["from"] = "JPY"
            if payload.get("to") not in self.currencies:
                payload["to"] = "USD" if "USD" in self.currencies else "JPY"

            payload["recent_csv_paths"] = self._update_recent_paths("murc")
            self._write_config(payload)
            return payload
        finally:
            progress_cb(100)

    # -------- Public methods --------
    def init(self):
        payload = self._base_payload()
        self._apply_config(payload)

        try:
            if payload.get("source_id") == "murc":
                return self._load_murc(payload, autorender=True, do_update=True)
            return self._load_mizuho(payload, autorender=True, force_download=False)
        except Exception as e:
            payload["autorender"] = False
            payload["error"] = str(e)
            return payload

    def set_source(self, source_id: str):
        source_id = str(source_id or "").strip().lower()
        if source_id not in ("mizuho", "murc"):
            return {"error": f"Unknown source: {source_id}"}

        payload = self._base_payload()
        self._apply_config(payload)
        payload["source_id"] = source_id

        try:
            if source_id == "murc":
                return self._load_murc(payload, autorender=True, do_update=True)
            return self._load_mizuho(payload, autorender=True, force_download=False)
        except Exception as e:
            return {"error": str(e)}

    def set_rate_basis(self, rate_basis: str):
        """
        Change MURC rate basis (ttm/tts/ttb) and reload from local DB WITHOUT crawling.
        """
        rb = str(rate_basis or "").strip().lower()
        if rb not in ("ttm", "tts", "ttb"):
            return {"error": f"Unknown rate basis: {rate_basis}"}

        payload = self._base_payload()
        self._apply_config(payload)
        payload["rate_basis"] = rb

        # only relevant for MURC; for Mizuho just save config and return base
        if self.source_id != "murc":
            payload["rate_basis"] = rb
            payload["rate_basis_label"] = self._rate_basis_label()
            self._write_config(payload)
            return payload

        try:
            return self._load_murc(payload, autorender=True, do_update=False)
        except Exception as e:
            return {"error": str(e)}

    def refresh_rates(self, source_id: str = "", rate_basis: str = ""):
        source_id = str(source_id or "").strip().lower() or self.source_id
        payload = self._base_payload()
        self._apply_config(payload)

        if source_id not in ("mizuho", "murc"):
            return {"error": f"Unknown source: {source_id}"}

        if rate_basis:
            payload["rate_basis"] = str(rate_basis).strip().lower()

        try:
            if source_id == "murc":
                payload["source_id"] = "murc"
                return self._load_murc(payload, autorender=True, do_update=True)
            payload["source_id"] = "mizuho"
            return self._load_mizuho(payload, autorender=True, force_download=True)
        except Exception as e:
            return {"error": str(e)}

    def use_latest(self, mode):
        if self.df_rates is None:
            return {}
        dates = sorted(self.df_rates.index)
        if not dates:
            return {}
        latest = dates[-1]
        if mode == "month":
            return {"year": str(latest.year), "month": f"{latest.month:02d}"}
        return {"day": str(latest)}

    def _get_selected_date(self, payload):
        if self.df_rates is None:
            return None
        mode = payload.get("date_mode", "day")
        if mode == "day":
            s = (payload.get("day") or "").strip()
            if not s:
                return None
            return dt.date.fromisoformat(s)

        y = (payload.get("year") or "").strip()
        m = (payload.get("month") or "").strip()
        if not y or not m:
            return None
        y = int(y)
        m = int(m)
        month_dates = [d for d in self.df_rates.index if d.year == y and d.month == m]
        if not month_dates:
            return None
        return max(month_dates)

    def render(self, payload):
        out = {
            "result": "-",
            "used_date": "-",
            "sel_date": "-",
            "rate_from": "-",
            "rate_to": "-",
            "rate_cross": "-",
            "audit_summary": "-",
            "rate_info": "-",
            "fallback": "",
            "rate_basis_label": self._rate_basis_label(),
            "source_id": self.source_id,
            "rate_basis": self.rate_basis,
            "result_rounding": self.result_rounding,
            "result_decimals": self.result_decimals,
        }

        if self.df_rates is None:
            out["error"] = "Please load rates first."
            self._write_config(payload)
            return out

        req_date = self._get_selected_date(payload)
        if req_date is None:
            out["error"] = "Please select a valid date/month."
            self._write_config(payload)
            return out

        from_cur = payload.get("from", "JPY")
        to_cur = payload.get("to", "USD")
        result_rounding = normalize_result_rounding(payload.get("result_rounding", self.result_rounding))
        result_decimals = normalize_result_decimals(payload.get("result_decimals", self.result_decimals))
        payload["result_rounding"] = result_rounding
        payload["result_decimals"] = result_decimals
        out["result_rounding"] = result_rounding
        out["result_decimals"] = result_decimals

        jpy_from, used_from, _ = get_jpy_per_unit(self.df_rates, from_cur, req_date)
        jpy_to, used_to, _ = get_jpy_per_unit(self.df_rates, to_cur, req_date)

        used = None
        if used_from and used_to:
            used = min(used_from, used_to)
        else:
            used = used_from or used_to

        out["sel_date"] = str(used) if used else "-"
        out["rate_from"] = "N/A" if jpy_from is None else f"{jpy_from:.6f} JPY per 1 {from_cur}"
        out["rate_to"] = "N/A" if jpy_to is None else f"{jpy_to:.6f} JPY per 1 {to_cur}"
        if jpy_from is None or jpy_to is None:
            out["rate_cross"] = "N/A"
        else:
            cross = jpy_from / jpy_to
            out["rate_cross"] = f"1 {from_cur} = {cross:.8f} {to_cur}"

        try:
            amount = parse_amount(payload.get("amount", ""))
        except Exception:
            if payload.get("force_format"):
                payload["amount"] = ""
            self._write_config(payload)
            return out

        if payload.get("force_format"):
            payload["amount"] = format_amount(amount, 2)
            out["amount"] = payload["amount"]

        try:
            res = convert_amount(self.df_rates, from_cur, to_cur, req_date, amount)
            rounded_result = round_result_value(res["result"], result_decimals, result_rounding)
            if rounded_result == 0:
                rounded_result = abs(rounded_result)
            out["result"] = f"{format_decimal_amount(rounded_result, result_decimals)}  {to_cur}"
            out["used_date"] = str(res["used_date"])
            source_for_summary = "mizuho" if self.source_id == "mizuho" else "murc"
            basis_for_summary = "TTM" if self.source_id == "mizuho" else self.rate_basis.upper()
            summary_rate_decimals = 2 if to_cur == "JPY" else 6
            out["audit_summary"] = (
                f"{source_for_summary} {basis_for_summary} | {res['used_date']}\n"
                f"{from_cur} {format_amount(amount, 2)} @ {to_cur} {format_amount(res['cross'], summary_rate_decimals)}"
            )

            basis_note = (
                f"Rate basis: {self._rate_basis_label()} | Source: {self.source_id}\n"
            )
            out["rate_info"] = basis_note + res["rate_info"]

            if res["used_date_from"] != req_date or res["used_date_to"] != req_date:
                out["fallback"] = (
                    "Note: exact date may be missing. Using nearest previous available date(s). "
                    f"Requested: {req_date}"
                )
        except Exception as e:
            out["error"] = str(e)
            out["rate_info"] = str(e)

        payload["csv_path"] = self.csv_path
        payload["source_id"] = self.source_id
        payload["rate_basis"] = self.rate_basis
        self._write_config(payload)
        return out


# -----------------------------
# Main
# -----------------------------
def main():
    api = FXWebAPI()
    ensure_webview2_loader()
    ensure_webview2_user_data_dir()
    warn_if_webview2_missing()
    html = load_ui_html()
    preferred_gui = pick_gui_backend()

    webview.create_window(
        "FX Converter (HTML UI)",
        html=html,
        js_api=api,
        width=1240,
        height=900,
        min_size=(1020, 740),
        text_select=False,
    )

    try:
        webview.start(gui=preferred_gui, debug=False, http_server=False)
    except Exception:
        webview.start(gui="mshtml", debug=False, http_server=False)


if __name__ == "__main__":
    main()
