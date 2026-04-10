const $ = (id) => document.getElementById(id);

const state = {
  loaded: false,
  renderTimer: null,
  minDate: "",
  maxDate: "",
  sourceId: "mizuho",
  rateBasis: "ttm",
  rateBasisLabel: "-",
  theme: "light",
  lang: "en",
  csvPath: "",
  sources: null,
  rateBases: null,
  recent: null,
  resultRounding: "half_up",
  resultDecimals: "2",
  loading: false
};

const memoryStore = {};
function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    memoryStore[key] = String(value);
  }
}

const I18N = {
  en: {
    app_title: "FX Converter",
    app_subtitle: "Accounting-friendly FX rates (Mizuho / Mitsubishi MURC)",
    label_updating: "Updating rates:",
    label_source: "Data source",
    label_provider: "Provider",
    label_rate_basis: "Rate basis (TTM / TTS / TTB)",
    btn_refresh: "Refresh",
    btn_refreshing: "Refreshing...",
    label_loaded: "Loaded:",
    label_current_basis: "Current basis:",
    label_recent_sources: "Recent sources",
    btn_use_recent: "Use recent",
    hint_recent: "Quick switch between providers",
    label_from: "From",
    label_to: "To",
    btn_swap: "Swap",
    label_date_mode: "Date mode",
    opt_day: "Day",
    opt_month: "Month",
    label_day: "Day",
    label_year: "Year",
    label_month: "Month",
    btn_latest: "Use latest",
    range_available: "Available range: {min} to {max}",
    label_amount: "Amount",
    hint_amount: "Auto convert; Enter/blur formats",
    label_result: "Result",
    hint_result: "Choose currencies and a date to see results.",
    label_used_rate_date: "Used rate date:",
    label_basis: "Basis:",
    label_resolved_date: "Resolved date",
    label_from_jpy: "From → JPY",
    label_to_jpy: "To → JPY",
    label_cross: "Cross",
    label_result_rounding: "Result rounding",
    label_result_decimals: "Result decimals",
    rounding_half_up: "Half up",
    rounding_up: "Round up (ceiling)",
    rounding_down: "Round down (floor)",
    label_auto_summary: "Auto summary",
    label_rate_details: "Rate details",
    details_show: "Show",
    details_hide: "Hide",
    rate_details_init: "Refresh to start.",
    loaded_yes: "Rates loaded",
    loaded_no: "No rates loaded",
    not_loaded: "Not loaded",
    theme_dark: "Dark",
    theme_light: "Light",
    theme_switch_dark: "Switch to dark theme",
    theme_switch_light: "Switch to light theme",
    lang_switch_to_ja: "日本語",
    lang_switch_to_en: "English",
    lang_title_to_ja: "Switch to Japanese",
    lang_title_to_en: "Switch to English",
    none_option: "(none)",
    source_mizuho: "Mizuho (quote.csv)",
    source_murc: "Mitsubishi (MURC)",
    basis_ttm: "TTM (mid rate)",
    basis_tts: "TTS (Telegraphic Transfer Selling)",
    basis_ttb: "TTB (Telegraphic Transfer Buying)"
  },
  ja: {
    app_title: "為替換算",
    app_subtitle: "会計向け為替レート（みずほ / 三菱MURC）",
    label_updating: "更新中：",
    label_source: "データソース",
    label_provider: "提供元",
    label_rate_basis: "レート区分（TTM / TTS / TTB）",
    btn_refresh: "更新",
    btn_refreshing: "更新中...",
    label_loaded: "読込元：",
    label_current_basis: "現在の区分：",
    label_recent_sources: "最近使ったソース",
    btn_use_recent: "最近のソースを使う",
    hint_recent: "提供元をすばやく切替",
    label_from: "換算元",
    label_to: "換算先",
    btn_swap: "入替",
    label_date_mode: "日付モード",
    opt_day: "日付",
    opt_month: "月次",
    label_day: "日付",
    label_year: "年",
    label_month: "月",
    btn_latest: "最新を使う",
    range_available: "利用可能範囲：{min} ～ {max}",
    label_amount: "金額",
    hint_amount: "自動換算。Enter/フォーカス外で整形",
    label_result: "結果",
    hint_result: "通貨と日付を選択すると結果が表示されます。",
    label_used_rate_date: "適用レート日：",
    label_basis: "区分：",
    label_resolved_date: "使用日",
    label_from_jpy: "換算元 → JPY",
    label_to_jpy: "換算先 → JPY",
    label_cross: "クロス",
    label_rate_details: "レート詳細",
    details_show: "表示",
    details_hide: "非表示",
    rate_details_init: "更新すると表示されます。",
    loaded_yes: "レート読込済み",
    loaded_no: "未読込",
    not_loaded: "未読込",
    theme_dark: "ダーク",
    theme_light: "ライト",
    theme_switch_dark: "ダークテーマに切替",
    theme_switch_light: "ライトテーマに切替",
    lang_switch_to_ja: "日本語",
    lang_switch_to_en: "English",
    lang_title_to_ja: "日本語に切替",
    lang_title_to_en: "英語に切替",
    none_option: "（なし）",
    source_mizuho: "みずほ（quote.csv）",
    source_murc: "三菱MURC",
    basis_ttm: "TTM（仲値）",
    basis_tts: "TTS（電信売相場）",
    basis_ttb: "TTB（電信買相場）"
  }
};

// Fix any corrupted non-ASCII literals in the English block (Windows encoding issues)
if (I18N.en) {
  I18N.en.label_from_jpy = "From -> JPY";
  I18N.en.label_to_jpy = "To -> JPY";
  I18N.en.lang_switch_to_ja = "Japanese";
}

function normalizeLang(lang) {
  return lang === "ja" ? "ja" : "en";
}

function t(key, vars) {
  const lang = normalizeLang(state.lang);
  const dict = I18N[lang] || I18N.en;
  let out = dict[key] || I18N.en[key] || key;
  if (vars) {
    Object.keys(vars).forEach(k => {
      const token = `{${k}}`;
      out = out.split(token).join(vars[k]);
    });
  }
  return out;
}

function updateThemeToggle() {
  const toggleBtn = $("theme-toggle");
  if (!toggleBtn) return;
  if (state.theme === "dark") {
    toggleBtn.innerHTML = (
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="4"></circle>' +
        '<path d="M12 2v3"></path><path d="M12 19v3"></path>' +
        '<path d="M4.22 4.22l2.12 2.12"></path><path d="M17.66 17.66l2.12 2.12"></path>' +
        '<path d="M2 12h3"></path><path d="M19 12h3"></path>' +
        '<path d="M4.22 19.78l2.12-2.12"></path><path d="M17.66 6.34l2.12-2.12"></path>' +
      "</svg>"
    );
    toggleBtn.title = t("theme_switch_light");
  } else {
    toggleBtn.innerHTML = (
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M21 15.5A9 9 0 1 1 8.5 3a7 7 0 0 0 12.5 12.5z"></path>' +
      "</svg>"
    );
    toggleBtn.title = t("theme_switch_dark");
  }
}

function updateBrand(sourceId) {
  const sid = (sourceId || state.sourceId || "mizuho").toLowerCase();
  const brand = (sid === "murc") ? "murc" : "mizuho";
  document.documentElement.setAttribute("data-brand", brand);
}

function updateLangToggle() {
  const btn = $("lang-toggle");
  if (!btn) return;
  if (state.lang === "ja") {
    btn.innerHTML = (
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="9"></circle>' +
        '<path d="M3 12h18"></path>' +
        '<path d="M12 3a15 15 0 0 1 0 18"></path>' +
        '<path d="M12 3a15 15 0 0 0 0 18"></path>' +
      "</svg>"
    );
    btn.title = t("lang_title_to_en");
  } else {
    btn.innerHTML = (
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="9"></circle>' +
        '<path d="M3 12h18"></path>' +
        '<path d="M12 3a15 15 0 0 1 0 18"></path>' +
        '<path d="M12 3a15 15 0 0 0 0 18"></path>' +
      "</svg>"
    );
    btn.title = t("lang_title_to_ja");
  }
}

function updateDetailsHint() {
  const details = $("details");
  const hint = $("details-hint");
  if (!details || !hint) return;
  hint.textContent = details.open ? t("details_hide") : t("details_show");
}

function updateRangeText() {
  const rangeText = $("range-text");
  if (!rangeText) return;
  const min = state.minDate || "-";
  const max = state.maxDate || "-";
  const textEl = rangeText.querySelector("[data-i18n='range_available']") || rangeText;
  textEl.textContent = t("range_available", { min, max });
}

function applyI18n() {
  document.documentElement.lang = normalizeLang(state.lang);
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  updateThemeToggle();
  updateLangToggle();
  updateDetailsHint();
  updateRangeText();
  setLoaded(state.csvPath);
  setLoading(state.loading);

  if (state.sources) setSources(state.sources, state.sourceId);
  if (state.rateBases) setRateBases(state.rateBases, state.rateBasis);
  if (state.recent) setRecent(state.recent);

  const rateDetails = $("rate-details");
  if (rateDetails) {
    const enInit = I18N.en.rate_details_init;
    const jaInit = I18N.ja.rate_details_init;
    if (rateDetails.textContent === enInit || rateDetails.textContent === jaInit) {
      rateDetails.textContent = t("rate_details_init");
    }
  }
}

function setStatus(msg, type) {
  const el = $("status");
  if (!msg) {
    el.textContent = "";
    el.className = "status hidden";
    return;
  }
  el.textContent = msg;
  el.className = type === "error" ? "status error" : "status";
}

function setLoaded(path) {
  state.csvPath = path || "";
  $("csv-path").textContent = path || t("not_loaded");
  const pill = $("loaded-pill");
  pill.textContent = path ? t("loaded_yes") : t("loaded_no");
  pill.classList.toggle("ok", !!path);
  pill.classList.toggle("off", !path);
  state.loaded = !!path;
}

function setLoading(on) {
  state.loading = !!on;
  const refreshBtn = $("btn-refresh");
  refreshBtn.disabled = !!on;
  $("btn-open-recent").disabled = !!on;
  $("source-select").disabled = !!on;
  const basis = $("basis-select");
  if (basis) basis.disabled = !!on;
  const rounding = $("result-rounding");
  if (rounding) rounding.disabled = !!on;
  const decimals = $("result-decimals");
  if (decimals) decimals.disabled = !!on;

  refreshBtn.classList.toggle("loading", !!on);
  const label = refreshBtn.querySelector(".btn-text");
  if (label) label.textContent = on ? t("btn_refreshing") : t("btn_refresh");
}

function setLoadProgress(pct) {
  const wrap = $("progress-wrap");
  const fill = $("progress-fill");
  const text = $("progress-text");

  if (pct === null) {
    wrap.style.display = "none";
    fill.style.width = "0%";
    text.textContent = "0%";
    return;
  }
  if (pct >= 100) {
    fill.style.width = "100%";
    text.textContent = "100%";
    setTimeout(() => {
      wrap.style.display = "none";
    }, 300);
    return;
  }
  wrap.style.display = "block";
  fill.style.width = `${pct}%`;
  text.textContent = `${pct}%`;
}

function toggleTheme() {
  try {
    const html = document.documentElement;

    if (state.theme === "light") {
      html.setAttribute("data-theme", "dark");
      state.theme = "dark";
    } else {
      html.removeAttribute("data-theme");
      state.theme = "light";
    }
    updateThemeToggle();

    // Save theme preference
    safeStorageSet("fx-converter-theme", state.theme);
  } catch (error) {
    console.error("Error toggling theme:", error);
  }
}

function loadThemePreference() {
  try {
    const savedTheme = safeStorageGet("fx-converter-theme") || "light";
    state.theme = savedTheme;

    const html = document.documentElement;
    if (savedTheme === "dark") {
      html.setAttribute("data-theme", "dark");
    }
    updateThemeToggle();
  } catch (error) {
    console.error("Error loading theme preference:", error);
  }
}

function loadLangPreference() {
  try {
    const savedLang = normalizeLang(safeStorageGet("fx-converter-lang") || "en");
    state.lang = savedLang;
    updateLangToggle();
  } catch (error) {
    console.error("Error loading language preference:", error);
  }
}

function toggleLang() {
  state.lang = state.lang === "ja" ? "en" : "ja";
  safeStorageSet("fx-converter-lang", state.lang);
  applyI18n();
}

function setCurrencies(list) {
  const from = $("from-cur");
  const to = $("to-cur");
  from.innerHTML = "";
  to.innerHTML = "";
  list.forEach(cur => {
    const o1 = document.createElement("option");
    o1.value = cur; o1.textContent = cur;
    const o2 = document.createElement("option");
    o2.value = cur; o2.textContent = cur;
    from.appendChild(o1);
    to.appendChild(o2);
  });
}

function setYears(years) {
  const y = $("year-select");
  y.innerHTML = "";
  (years || []).forEach(v => {
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    y.appendChild(o);
  });
}

function setRecent(list) {
  const sel = $("recent-select");
  sel.innerHTML = "";
  if (!list || list.length === 0) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = t("none_option");
    sel.appendChild(o);
    sel.title = "";
    return;
  }
  list.forEach(p => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = p;
    sel.appendChild(o);
  });
  sel.title = list[0] || "";
}

function setMonthOptions() {
  const m = $("month-select");
  m.innerHTML = "";
  for (let i = 1; i <= 12; i++) {
    const v = String(i).padStart(2, "0");
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    m.appendChild(o);
  }
}

function setSources(sources, selected) {
  const sel = $("source-select");
  sel.innerHTML = "";
  (sources || []).forEach(s => {
    const o = document.createElement("option");
    o.value = s.id;
    if (s.id === "mizuho") o.textContent = t("source_mizuho");
    else if (s.id === "murc") o.textContent = t("source_murc");
    else o.textContent = s.label || s.id;
    sel.appendChild(o);
  });
  if (selected) sel.value = selected;
}

function setRateBases(bases, selected) {
  const sel = $("basis-select");
  if (!sel) return;
  sel.innerHTML = "";
  (bases || []).forEach(b => {
    const o = document.createElement("option");
    o.value = b.id;
    if (b.id === "ttm") o.textContent = t("basis_ttm");
    else if (b.id === "tts") o.textContent = t("basis_tts");
    else if (b.id === "ttb") o.textContent = t("basis_ttb");
    else o.textContent = b.label || b.id;
    sel.appendChild(o);
  });
  if (selected) sel.value = selected;
}

function showBasisUI(show) {
  const wrap = $("basis-wrap");
  if (!wrap) return;
  wrap.style.display = show ? "flex" : "none";
}

function setBasisLabel(label) {
  const v = label || "-";
  $("basis-pill").textContent = v;
  $("basis-inline").textContent = v;
  state.rateBasisLabel = v;
}

function toggleDateMode(mode) {
  const day = mode === "day";
  $("day-group").style.display = day ? "block" : "none";
  $("month-group").style.display = day ? "none" : "block";
  $("month-group-2").style.display = day ? "none" : "block";
}

function applyState(payload) {
  if (!payload) return;

  if (payload.sources) {
    state.sources = payload.sources;
    setSources(payload.sources, payload.source_id);
  }
  if (payload.murc_rate_bases) {
    state.rateBases = payload.murc_rate_bases;
    setRateBases(payload.murc_rate_bases, payload.rate_basis);
  }

  if (payload.source_id) state.sourceId = payload.source_id;
  if (payload.rate_basis) state.rateBasis = payload.rate_basis;
  if (payload.lang) {
    const storedLang = safeStorageGet("fx-converter-lang");
    if (!storedLang) {
      state.lang = normalizeLang(payload.lang);
      safeStorageSet("fx-converter-lang", state.lang);
    }
  }
  updateBrand(payload.source_id || state.sourceId);

  // Show basis selector only for MURC
  showBasisUI((payload.source_id || state.sourceId) === "murc");

  if (payload.currencies) setCurrencies(payload.currencies);
  if (payload.years) setYears(payload.years);
  setMonthOptions();

  if (payload.from) $("from-cur").value = payload.from;
  if (payload.to) $("to-cur").value = payload.to;
  if (payload.date_mode) $("date-mode").value = payload.date_mode;
  if (payload.amount !== undefined) $("amount-input").value = payload.amount;
  if (payload.result_rounding) {
    state.resultRounding = payload.result_rounding;
    $("result-rounding").value = payload.result_rounding;
  }
  if (payload.result_decimals !== undefined) {
    state.resultDecimals = String(payload.result_decimals);
    $("result-decimals").value = String(payload.result_decimals);
  }

  if (payload.day) $("day-input").value = payload.day;
  if (payload.year) $("year-select").value = payload.year;
  if (payload.month) $("month-select").value = payload.month;

  if (payload.recent_csv_paths) {
    state.recent = payload.recent_csv_paths;
    setRecent(payload.recent_csv_paths);
  }

  if (payload.min_date) {
    $("day-input").min = payload.min_date;
    state.minDate = payload.min_date;
  }
  if (payload.max_date) {
    $("day-input").max = payload.max_date;
    state.maxDate = payload.max_date;
  }
  updateRangeText();

  toggleDateMode(payload.date_mode || $("date-mode").value);
  setLoaded(payload.csv_path || "");

  // Show basis label for accounting-friendly UI
  if (payload.rate_basis_label) setBasisLabel(payload.rate_basis_label);
  else {
    // fallback label
    if ((payload.source_id || state.sourceId) === "murc") setBasisLabel((payload.rate_basis || state.rateBasis || "ttm").toUpperCase());
    else setBasisLabel("MIZUHO");
  }

  // keep selectors in sync
  if (payload.source_id) $("source-select").value = payload.source_id;
  if ($("basis-select") && payload.rate_basis) $("basis-select").value = payload.rate_basis;

  applyI18n();
}

function updateResult(out) {
  $("result").textContent = out.result || "-";
  $("used-date").textContent = out.used_date || "-";
  $("sel-date").textContent = out.sel_date || "-";
  $("rate-from").textContent = out.rate_from || "-";
  $("rate-to").textContent = out.rate_to || "-";
  $("rate-cross").textContent = out.rate_cross || "-";
  $("auto-summary").textContent = out.audit_summary || "-";
  $("rate-details").textContent = out.rate_info || "-";
  $("fallback-info").textContent = out.fallback || "";
  const hint = $("result-hint");
  if (hint) {
    const hasResult = out.result && out.result !== "-";
    hint.style.display = hasResult ? "none" : "block";
  }

  // show basis label if provided
  if (out.rate_basis_label) setBasisLabel(out.rate_basis_label);
  if (out.result_rounding) $("result-rounding").value = out.result_rounding;
  if (out.result_decimals !== undefined) $("result-decimals").value = String(out.result_decimals);
}

function gatherPayload() {
  return {
    from: $("from-cur").value,
    to: $("to-cur").value,
    date_mode: $("date-mode").value,
    day: $("day-input").value,
    year: $("year-select").value,
    month: $("month-select").value,
    amount: $("amount-input").value,
    result_rounding: $("result-rounding").value,
    result_decimals: $("result-decimals").value,
    source_id: $("source-select").value,
    rate_basis: ($("basis-select") ? $("basis-select").value : ""),
    lang: state.lang
  };
}

async function renderNow(forceFormat) {
  if (!state.loaded) return;
  const payload = gatherPayload();
  payload.force_format = !!forceFormat;
  try {
    const out = await pywebview.api.render(payload);
    if (out.error) setStatus(out.error, "error");
    else setStatus("", "");
    if (out.amount !== undefined) $("amount-input").value = out.amount;
    updateResult(out);
  } catch (err) {
    setStatus(String(err), "error");
  }
}

function scheduleRender() {
  if (state.renderTimer) clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(() => renderNow(false), 250);
}

/**
 * Refresh rates by calling backend refresh_rates(source_id, rate_basis)
 */
async function refreshRates() {
  setStatus("", "");
  setLoading(true);
  setLoadProgress(0);

  try {
    const sid = $("source-select").value;
    const rb = ($("basis-select") ? $("basis-select").value : "");
    const out = await pywebview.api.refresh_rates(sid, rb);

    if (out && out.error) {
      setStatus(out.error, "error");
      setLoadProgress(null);
      return;
    }
    if (out && out.csv_path) {
      applyState(out);
      renderNow(true);
    } else {
      setLoadProgress(null);
    }
  } finally {
    setLoading(false);
  }
}

async function init() {
  setMonthOptions();
  try {
    const initData = await pywebview.api.init();
    if (initData) {
      applyState(initData);
      if (initData.error) setStatus(initData.error, "error");
      if (initData.autorender) renderNow(true);
    }
  } catch (err) {
    setStatus(String(err), "error");
  }
}

/**
 * Change source (will update & load)
 */
async function onSourceChanged() {
  setStatus("", "");
  setLoading(true);
  setLoadProgress(0);

  try {
    const sid = $("source-select").value;
    // UI: show/hide basis selector immediately
    showBasisUI(sid === "murc");

    const out = await pywebview.api.set_source(sid);
    if (out && out.error) {
      setStatus(out.error, "error");
      setLoadProgress(null);
      return;
    }
    if (out && out.csv_path) {
      applyState(out);
      renderNow(true);
    } else {
      setLoadProgress(null);
    }
  } finally {
    setLoading(false);
  }
}

/**
 * Change MURC rate basis (ttm/tts/ttb) without crawling
 */
async function onBasisChanged() {
  // Only for murc
  const sid = $("source-select").value;
  if (sid !== "murc") return;

  setStatus("", "");
  setLoading(true);
  setLoadProgress(0);

  try {
    const rb = $("basis-select").value;
    const out = await pywebview.api.set_rate_basis(rb);

    if (out && out.error) {
      setStatus(out.error, "error");
      setLoadProgress(null);
      return;
    }
    if (out && out.csv_path !== undefined) {
      applyState(out);
      renderNow(true);
    } else {
      setLoadProgress(null);
    }
  } finally {
    setLoading(false);
  }
}


// -----------------------------
// Event bindings
// -----------------------------
document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);
document.getElementById("lang-toggle")?.addEventListener("click", toggleLang);

$("btn-refresh").addEventListener("click", refreshRates);

$("source-select").addEventListener("change", onSourceChanged);
$("basis-select").addEventListener("change", onBasisChanged);

$("btn-open-recent").addEventListener("click", async () => {
  const v = $("recent-select").value;
  if (!v) return;

  // Recent stores "mizuho"/"murc"
  $("source-select").value = v;
  await onSourceChanged();
});

$("recent-select").addEventListener("change", () => {
  $("recent-select").title = $("recent-select").value || "";
});

$("btn-swap").addEventListener("click", () => {
  const f = $("from-cur").value;
  $("from-cur").value = $("to-cur").value;
  $("to-cur").value = f;
  scheduleRender();
});

$("btn-latest").addEventListener("click", async () => {
  const out = await pywebview.api.use_latest($("date-mode").value);
  if (out.day) $("day-input").value = out.day;
  if (out.year) $("year-select").value = out.year;
  if (out.month) $("month-select").value = out.month;
  scheduleRender();
});

$("date-mode").addEventListener("change", () => {
  toggleDateMode($("date-mode").value);
  scheduleRender();
});

$("from-cur").addEventListener("change", scheduleRender);
$("to-cur").addEventListener("change", scheduleRender);
$("day-input").addEventListener("change", scheduleRender);
$("year-select").addEventListener("change", scheduleRender);
$("month-select").addEventListener("change", scheduleRender);
$("result-rounding").addEventListener("change", scheduleRender);
$("result-decimals").addEventListener("change", scheduleRender);

$("amount-input").addEventListener("input", scheduleRender);
$("amount-input").addEventListener("blur", () => renderNow(true));
$("amount-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") renderNow(true);
});

window.addEventListener("pywebviewready", init);

// Load preferences when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  loadThemePreference();
  loadLangPreference();
  applyI18n();
  const details = $("details");
  if (details) details.addEventListener("toggle", updateDetailsHint);
});

// Surface unexpected JS errors in the status bar
window.addEventListener("error", (e) => {
  setStatus(e.message || "Unexpected error", "error");
});
window.addEventListener("unhandledrejection", (e) => {
  setStatus(String(e.reason || "Promise error"), "error");
});
