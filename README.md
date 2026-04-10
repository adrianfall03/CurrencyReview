# FX Converter / 外貨換算 / 为替換算

[English](#english) | [日本語](#日本語) | [中文](#中文)

---

## English

### Overview
FX Converter is a desktop GUI tool for foreign exchange conversion using CSV-based rates.  
It provides a clean HTML UI (pywebview) and supports two data sources:

- Mizuho Bank CSV (direct download)
- Mitsubishi UFJ Research and Consulting (MURC) past FX rates (incremental crawl)

### Features
- GUI-based conversion with day or month selection
- Two data sources (Mizuho / MURC)
- MURC rate basis selectable: TTM / TTS / TTB
- Cross-rate calculation via JPY
- Local cache for faster reloads
- Light/Dark theme toggle

### Requirements
- Windows 10/11 recommended
- Python 3.8+ (tested with Windows desktop)
- WebView2 Runtime recommended (app will fall back to MSHTML if missing)

### Setup
Create a virtual environment and install dependencies (recommended: use `bootstrap_env.py`):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Or use the bootstrap script:

```bash
python bootstrap_env.py
```

### Run
```bash
python fx_gui.py
```

### Build (optional, PyInstaller)
```bash
python bootstrap_env.py --with-pyinstaller
pyinstaller fx_gui.spec
```

### Project Structure (key files)
| File | Description |
|---|---|
| `fx_gui.py` | Main app (API + UI glue) |
| `ui/` | HTML/CSS/JS for the GUI |
| `fx_gui.spec` | PyInstaller build spec |
| `bootstrap_env.py` | Create venv + install dependencies |
| `requirements.txt` | Python dependencies |
| `user_config.json` | Local UI settings (auto-created) |
| `cache/mizuho_quote.csv` | Cached Mizuho rates (auto-updated) |
| `cache/mizuho_download_log.json` | Mizuho daily download counter |
| `cache/murc_kawase_daily.csv` | Cached MURC rates (auto-updated) |
| `cache/murc_last_date.txt` | MURC incremental crawl state |

### Mizuho Download — Notes
The app downloads `quote.csv` directly from Mizuho Bank's server using browser-like HTTP headers
to bypass WAF bot-detection. The following safeguards are in place:

- **Cookie prefetch**: visits the market index page first to obtain a session cookie before requesting the CSV.
- **Retry (×3)**: retries up to 3 times with increasing delays on failure.
- **curl fallback**: if Python `requests` fails, the system `curl` (different TLS fingerprint) is tried automatically.
- **Daily limit**: at most **2 server fetches per calendar day** are allowed (tracked in `cache/mizuho_download_log.json`). Further requests within the day reuse the local cache.
- **Manual fallback**: if automatic download fails, open `https://www.mizuhobank.co.jp/market/quote.csv` in a browser and save it as `cache/mizuho_quote.csv`.

### Notes
- If WebView2 Runtime is not installed, the app will show a warning and use MSHTML mode.
- MURC data is crawled incrementally and stored locally for faster subsequent launches.

---

## 日本語

### 概要
FX Converter は、CSV レートを使った外貨換算のデスクトップ GUI ツールです。  
HTML UI（pywebview）を採用し、以下 2 つのデータソースに対応します。

- みずほ銀行の CSV（直接ダウンロード）
- 三菱 UFJ リサーチ＆コンサルティング（MURC）の過去レート（増分クロール）

### 主な機能
- 日付／月指定の換算
- 2 つのデータソース（Mizuho / MURC）
- MURC レート種別：TTM / TTS / TTB の切替
- JPY を介したクロスレート計算
- ローカルキャッシュで高速ロード
- ライト／ダークテーマ切替

### 動作環境
- Windows 10/11 推奨
- Python 3.8+ 推奨
- WebView2 Runtime 推奨（未導入時は MSHTML にフォールバック）

### セットアップ
仮想環境を作成し、依存関係をインストールします（推奨：`bootstrap_env.py`）。

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

またはブートストラップスクリプトを使います。

```bash
python bootstrap_env.py
```

### 実行
```bash
python fx_gui.py
```

### ビルド（任意）
```bash
python bootstrap_env.py --with-pyinstaller
pyinstaller fx_gui.spec
```

### 主要ファイル
| ファイル | 説明 |
|---|---|
| `fx_gui.py` | メインアプリ |
| `ui/` | HTML/CSS/JS（GUI） |
| `fx_gui.spec` | PyInstaller 用設定 |
| `bootstrap_env.py` | venv 作成 + 依存関係インストール |
| `requirements.txt` | Python 依存関係 |
| `user_config.json` | UI 設定（自動生成） |
| `cache/mizuho_quote.csv` | Mizuho レートキャッシュ（自動更新） |
| `cache/mizuho_download_log.json` | Mizuho ダウンロード回数記録 |
| `cache/murc_kawase_daily.csv` | MURC レートキャッシュ（自動更新） |
| `cache/murc_last_date.txt` | MURC 増分クロール状態 |

### Mizuho ダウンロードについて
Mizuho 銀行のサーバーから `quote.csv` を直接取得する際、WAF のボット検知を回避するため
ブラウザに近い HTTP リクエストを送信します。以下の対策が実装されています。

- **Cookie 先取り**：CSV 取得前に市場ページを訪問してセッション Cookie を取得。
- **リトライ（×3）**：失敗時に間隔を空けて最大 3 回再試行。
- **curl フォールバック**：Python `requests` が失敗した場合、システムの `curl`（異なる TLS フィンガープリント）で試みる。
- **1 日 2 回上限**：サーバーへのアクセスは 1 日最大 **2 回** に制限（`cache/mizuho_download_log.json` で管理）。上限に達した場合はキャッシュを使用。
- **手動フォールバック**：自動ダウンロードが失敗した場合は、ブラウザで `https://www.mizuhobank.co.jp/market/quote.csv` を開き、`cache/mizuho_quote.csv` として保存してください。

### 補足
- WebView2 Runtime がない場合は警告が表示され、MSHTML で動作します。
- MURC のレートはローカルに増分保存されます。

---

## 中文

### 概述
FX Converter 是一个基于 CSV 汇率的外汇换算桌面 GUI 工具。  
界面使用 HTML（pywebview），支持两种数据来源：

- 瑞穗银行 CSV（直接下载）
- 三菱 UFJ 研究与咨询（MURC）历史汇率（增量抓取）

### 主要功能
- 支持按日期 / 月份换算
- 两种数据源（Mizuho / MURC）
- MURC 汇率类型可选：TTM / TTS / TTB
- 通过 JPY 计算交叉汇率
- 本地缓存提升加载速度
- 亮/暗主题切换

### 运行环境
- Windows 10/11 推荐
- Python 3.8+ 推荐
- 建议安装 WebView2 Runtime（缺失时会回退到 MSHTML）

### 安装
创建虚拟环境并安装依赖（推荐：`bootstrap_env.py`）：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

或者使用引导脚本：

```bash
python bootstrap_env.py
```

### 运行
```bash
python fx_gui.py
```

### 打包（可选）
```bash
python bootstrap_env.py --with-pyinstaller
pyinstaller fx_gui.spec
```

### 主要文件
| 文件 | 说明 |
|---|---|
| `fx_gui.py` | 主程序 |
| `ui/` | GUI 界面资源 |
| `fx_gui.spec` | PyInstaller 打包配置 |
| `bootstrap_env.py` | 创建 venv 并安装依赖 |
| `requirements.txt` | Python 依赖 |
| `user_config.json` | UI 设置（自动生成） |
| `cache/mizuho_quote.csv` | 瑞穗汇率缓存（自动更新） |
| `cache/mizuho_download_log.json` | 瑞穗每日下载次数记录 |
| `cache/murc_kawase_daily.csv` | MURC 汇率缓存（自动更新） |
| `cache/murc_last_date.txt` | MURC 增量抓取状态 |

### 瑞穗下载说明
从瑞穗银行服务器下载 `quote.csv` 时，程序使用接近真实浏览器的 HTTP 请求以绕过 WAF 机器人检测。
已实施以下保障措施：

- **Cookie 预取**：下载 CSV 前先访问市场首页获取 Session Cookie。
- **重试（×3）**：失败时以递增间隔最多重试 3 次。
- **curl 回退**：若 Python `requests` 失败，自动尝试系统自带的 `curl`（不同 TLS 指纹）。
- **每日限制 2 次**：每天最多向服务器请求 **2 次**（记录于 `cache/mizuho_download_log.json`），超出后使用本地缓存。
- **手动回退**：若自动下载失败，请用浏览器打开 `https://www.mizuhobank.co.jp/market/quote.csv`，另存为 `cache/mizuho_quote.csv`。

### 备注
- 如果未安装 WebView2 Runtime，会提示并回退到 MSHTML。
- MURC 数据会增量抓取并存到本地。
