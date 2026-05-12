# FX Converter / 外貨換算 / 外汇换算

[English](#english) | [日本語](#日本語) | [中文](#中文)

---

## English

### Overview
FX Converter is a web-based foreign exchange calculator deployed on Vercel.  
It supports three data sources and performs cross-rate conversion via JPY pivot.

**Live demo**: deploy to Vercel with one click.

### Data Sources
| Source | Coverage | Rate types |
|---|---|---|
| Mizuho Bank | 2002-04-01 to present | TTM only |
| ECB (Frankfurter) | 1999-01-04 to present | Mid rate |
| Mitsubishi MURC | 2014-01-01 to present | TTM / TTS / TTB |

### Features
- Day or month date selection
- Cross-rate calculation via JPY pivot
- Half-up / ceiling / floor rounding with configurable decimal places
- Explicit Convert button (or Enter key) — no accidental mid-typing saves
- Searchable currency dropdown with country flag icons
- Recent conversion history (up to 8 entries, stored in localStorage)
- Light/Dark theme, English/Japanese UI

### Architecture
- **Next.js 15** App Router, TypeScript, deployed on **Vercel**
- All rate fetching is server-side (API routes)
- **Mizuho**: GitHub Actions runs Playwright daily to download the CSV (bypassing Akamai WAF) and uploads it to **Vercel Blob**. The app reads from Blob.
- **ECB**: fetched live from `api.frankfurter.app`
- **MURC**: HTML scraping via `cheerio`

### Project Structure
| Path | Description |
|---|---|
| `app/` | Next.js App Router pages and API routes |
| `app/api/currencies/` | Currency list endpoint |
| `app/api/convert/` | Conversion endpoint |
| `components/FXConverter.tsx` | Main React client component |
| `components/CurrencySelect.tsx` | Searchable dropdown with flag images |
| `lib/flags.ts` | Currency → country code map and flag URL helper |
| `lib/mizuho.ts` | Mizuho CSV parser + Blob reader |
| `lib/frankfurter.ts` | ECB/Frankfurter API client |
| `lib/murc.ts` | MURC HTML scraper |
| `lib/rates.ts` | Conversion engine (JPY pivot) |
| `lib/types.ts` | Shared TypeScript types |
| `scripts/sync-mizuho.mjs` | GitHub Actions script: download CSV → upload to Blob |
| `.github/workflows/fetch-mizuho.yml` | Daily cron (weekdays 03:00 UTC) |

### Deployment
1. Push to GitHub, connect repo to Vercel.
2. Create a **Vercel Blob** store (Storage tab) with **Public** access and connect it to the project.
3. Copy `BLOB_READ_WRITE_TOKEN` and add it as a **GitHub Actions secret** in the repo settings.
4. Trigger **Fetch Mizuho CSV** workflow manually once (Actions tab → Run workflow).
5. Redeploy on Vercel — all three sources will be available.

### Local Development
```bash
npm install
npm run dev
```
Set `BLOB_READ_WRITE_TOKEN` in `.env.local` to use the Mizuho source locally.

---

## 日本語

### 概要
FX Converter は Vercel にデプロイする Web ベースの外貨換算ツールです。  
3 つのデータソースに対応し、JPY を介したクロスレート計算を行います。

### データソース
| ソース | 対応期間 | レート種別 |
|---|---|---|
| みずほ銀行 | 2002-04-01〜現在 | TTM のみ |
| ECB（Frankfurter） | 1999-01-04〜現在 | 仲値 |
| 三菱 MURC | 2014-01-01〜現在 | TTM / TTS / TTB |

### 主な機能
- 日付・月次の選択
- JPY を介したクロスレート計算
- 四捨五入・切上げ・切捨て、小数桁数設定
- 換算ボタンまたは Enter キーで明示的に換算（入力途中の誤保存なし）
- 国旗アイコン付き検索可能な通貨ドロップダウン
- 直近の換算履歴（最大 8 件、localStorage に保存）
- ライト／ダークテーマ、日英 UI 切替

### アーキテクチャ
- **Next.js 15** App Router + TypeScript、**Vercel** にデプロイ
- レート取得はすべてサーバーサイド（API ルート）
- **みずほ**: GitHub Actions が Playwright を使って毎日 CSV をダウンロード（Akamai WAF 回避）し、**Vercel Blob** にアップロード。アプリは Blob から読み込む
- **ECB**: `api.frankfurter.app` からライム取得
- **MURC**: `cheerio` で HTML スクレイピング

### デプロイ手順
1. GitHub にプッシュし、Vercel にリポジトリを接続。
2. Vercel の Storage タブで **Blob** ストアを **Public** で作成しプロジェクトに接続。
3. `BLOB_READ_WRITE_TOKEN` を GitHub Actions シークレットに追加。
4. Actions タブから **Fetch Mizuho CSV** を手動で一度実行。
5. Vercel で再デプロイ — 3 つのソースすべてが利用可能になります。

### ローカル開発
```bash
npm install
npm run dev
```
みずほソースをローカルで使う場合は `.env.local` に `BLOB_READ_WRITE_TOKEN` を設定してください。

---

## 中文

### 概述
FX Converter 是一个部署在 Vercel 上的网页版外汇换算工具。  
支持三种数据来源，通过 JPY 枢轴计算交叉汇率。

### 数据来源
| 来源 | 覆盖时段 | 汇率类型 |
|---|---|---|
| 瑞穗银行 | 2002-04-01 至今 | TTM |
| ECB（Frankfurter） | 1999-01-04 至今 | 中间价 |
| 三菱 MURC | 2014-01-01 至今 | TTM / TTS / TTB |

### 主要功能
- 支持按日期或月份换算
- 通过 JPY 枢轴计算交叉汇率
- 四舍五入 / 向上取整 / 向下取整，可配置小数位数
- 点击换算按钮或按 Enter 触发换算（不再自动保存中间输入状态）
- 带国旗图标的可搜索货币下拉框
- 最近换算记录（最多 8 条，存储于 localStorage）
- 亮/暗主题，日英界面切换

### 架构说明
- **Next.js 15** App Router + TypeScript，部署在 **Vercel**
- 所有汇率获取均在服务端（API 路由）
- **瑞穗**: GitHub Actions 每日用 Playwright 下载 CSV（绕过 Akamai WAF），上传到 **Vercel Blob**，应用从 Blob 读取
- **ECB**: 从 `api.frankfurter.app` 实时获取
- **MURC**: 通过 `cheerio` 抓取 HTML

### 部署步骤
1. 推送到 GitHub，将仓库连接到 Vercel。
2. 在 Vercel Storage 标签页创建 **Public** 访问的 Blob Store，连接到项目。
3. 将 `BLOB_READ_WRITE_TOKEN` 添加为 GitHub Actions Secret。
4. 在 Actions 标签页手动触发一次 **Fetch Mizuho CSV**。
5. 在 Vercel 重新部署——三个数据来源均可正常使用。

### 本地开发
```bash
npm install
npm run dev
```
本地使用瑞穗来源需在 `.env.local` 中设置 `BLOB_READ_WRITE_TOKEN`。
