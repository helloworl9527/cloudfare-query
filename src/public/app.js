"use strict";

import {
  clearEmailHistory,
  loadEmailHistory,
  rememberSuccessfulEmail,
  removeSuccessfulEmail,
} from "./email-history.js";

const translations = {
  zh: {
    "page.title": "query · 邮件查询",
    "page.brandAriaLabel": "query 首页",
    "page.siteLabel": "邮件查询",
    "hero.intro": "输入邮箱，可查看该最近 10 封邮件内容。",
    "tutorial.heading": "使用教程",
    "tutorial.step1": "在下方输入邮箱地址。",
    "tutorial.step2": "点击“查询”，查看最近 10 封邮件。",
    "tutorial.step3": "邮件默认以 HTML 原貌显示（沙箱隔离），远程图片等外部内容不会加载。",
    "tutorial.step4": "收件箱有新邮件时，点击“手动刷新”重新获取。",
    "query.heading": "查询条件",
    "query.externalIdLabel": "外部邮箱",
    "query.submit": "查询",
    "query.submitBusy": "查询中…",
    "query.refresh": "手动刷新",
    "query.refreshBusy": "刷新中…",
    "query.hint": '邮箱按大小写不敏感方式匹配，不会移除圆点或 <span lang="en">+tag</span>。',
    "query.historyHint": "查询成功的邮箱会保存在当前浏览器，可在下方选择或删除。",
    "history.heading": "本地查询记录",
    "history.clear": "清空全部",
    "history.remove": "删除 {0}",
    "results.eyebrow": "收件箱",
    "results.heading": "最近邮件",
    "validation.required": "请输入外部邮箱。",
    "validation.invalid": "请输入有效的邮箱地址。",
    "status.refreshing": "正在刷新最近邮件…",
    "status.querying": "正在查询最近邮件…",
    "status.timeout": "查询超时，请稍后手动刷新。",
    "status.connectFailed": "无法连接查询服务，请稍后重试。",
    "results.summary": "{0} 封 · {1}（北京时间）",
    "mail.noSubject": "（无主题）",
    "mail.from": "发件人：{0}",
    "mail.fromUnknown": "未知",
    "mail.noBody": "（无正文）",
    "mail.viewLabel": "显示方式",
    "mail.viewHtml": "HTML",
    "mail.viewText": "纯文本",
    "mail.frameTitle": "邮件正文",
    "mail.empty": "这个收件箱暂时没有邮件。",
    "mail.receivedSent": "接收 {0} · 发出 {1}（北京时间）",
    "mail.received": "接收 {0}（北京时间）",
    "mail.sent": "发出 {0}（北京时间）",
    "mail.timeUnknown": "时间未知",
    "badge.truncated": "正文已截断",
    "badge.parseFailed": "正文解析失败",
    "badge.tooLarge": "原始邮件超过解析上限",
    "badge.htmlToText": "HTML 已转为纯文本",
    "badge.fallback": "正文为降级解析结果",
    "badge.htmlTruncated": "HTML 正文已截断",
    "badge.imagesBlocked": "已屏蔽 {0} 张远程图片",
    "error.400": "外部邮箱格式不正确。",
    "error.404": "未找到对应的邮箱绑定，请检查输入。",
    "error.502": "上游邮件服务暂时不可用，请稍后重试。",
    "error.503": "当前查询较多，请稍后手动刷新。",
    "error.504": "上游邮件服务响应超时，请稍后手动刷新。",
    "error.5xx": "查询服务暂时不可用，请稍后重试。",
    "error.default": "查询失败，请检查输入后重试。",
  },
  "zh-Hant": {
    "page.title": "query · 郵件查詢",
    "page.brandAriaLabel": "query 首頁",
    "page.siteLabel": "郵件查詢",
    "hero.intro": "輸入郵箱，可查看該最近 10 封郵件內容。",
    "tutorial.heading": "使用教學",
    "tutorial.step1": "在下方輸入郵箱地址。",
    "tutorial.step2": "點擊「查詢」，查看最近 10 封郵件。",
    "tutorial.step3": "郵件預設以 HTML 原貌顯示（沙箱隔離），遠端圖片等外部內容不會載入。",
    "tutorial.step4": "收件匣有新郵件時，點擊「手動重新整理」重新取得。",
    "query.heading": "查詢條件",
    "query.externalIdLabel": "外部郵箱",
    "query.submit": "查詢",
    "query.submitBusy": "查詢中…",
    "query.refresh": "手動重新整理",
    "query.refreshBusy": "重新整理中…",
    "query.hint": '郵箱按大小寫不敏感方式匹配，不會移除圓點或 <span lang="en">+tag</span>。',
    "query.historyHint": "查詢成功的郵箱會儲存在目前瀏覽器，可在下方選擇或刪除。",
    "history.heading": "本機查詢記錄",
    "history.clear": "全部清除",
    "history.remove": "刪除 {0}",
    "results.eyebrow": "收件匣",
    "results.heading": "最近郵件",
    "validation.required": "請輸入外部郵箱。",
    "validation.invalid": "請輸入有效的郵箱地址。",
    "status.refreshing": "正在重新整理最近郵件…",
    "status.querying": "正在查詢最近郵件…",
    "status.timeout": "查詢逾時，請稍後手動重新整理。",
    "status.connectFailed": "無法連線查詢服務，請稍後重試。",
    "results.summary": "{0} 封．{1}（北京時間）",
    "mail.noSubject": "（無主旨）",
    "mail.from": "寄件者：{0}",
    "mail.fromUnknown": "未知",
    "mail.noBody": "（無內容）",
    "mail.viewLabel": "顯示方式",
    "mail.viewHtml": "HTML",
    "mail.viewText": "純文字",
    "mail.frameTitle": "郵件內容",
    "mail.empty": "這個收件匣暫時沒有郵件。",
    "mail.receivedSent": "收到 {0}．寄出 {1}（北京時間）",
    "mail.received": "收到 {0}（北京時間）",
    "mail.sent": "寄出 {0}（北京時間）",
    "mail.timeUnknown": "時間未知",
    "badge.truncated": "內容已截斷",
    "badge.parseFailed": "內容解析失敗",
    "badge.tooLarge": "原始郵件超過解析上限",
    "badge.htmlToText": "HTML 已轉為純文字",
    "badge.fallback": "內容為降級解析結果",
    "badge.htmlTruncated": "HTML 內容已截斷",
    "badge.imagesBlocked": "已封鎖 {0} 張遠端圖片",
    "error.400": "外部郵箱格式不正確。",
    "error.404": "找不到對應的郵箱綁定，請檢查輸入。",
    "error.502": "上游郵件服務暫時無法使用，請稍後重試。",
    "error.503": "目前查詢量較高，請稍後手動重新整理。",
    "error.504": "上游郵件服務回應逾時，請稍後手動重新整理。",
    "error.5xx": "查詢服務暫時無法使用，請稍後重試。",
    "error.default": "查詢失敗，請檢查輸入後重試。",
  },
  en: {
    "page.title": "query · Mail lookup",
    "page.brandAriaLabel": "query home",
    "page.siteLabel": "Mail lookup",
    "hero.intro": "Enter an email to view its last 10 messages.",
    "tutorial.heading": "How to use it",
    "tutorial.step1": "Enter your email address below.",
    "tutorial.step2": "Click \"Search\" to view the last 10 messages.",
    "tutorial.step3": "Mail is shown as HTML in a sandboxed frame; remote images and other external content are never loaded.",
    "tutorial.step4": "When new mail arrives, click \"Refresh\" to fetch it.",
    "query.heading": "Query",
    "query.externalIdLabel": "External email",
    "query.submit": "Search",
    "query.submitBusy": "Searching…",
    "query.refresh": "Refresh",
    "query.refreshBusy": "Refreshing…",
    "query.hint": "Matching is case-insensitive; dots and <span lang=\"en\">+tag</span> suffixes are not stripped.",
    "query.historyHint": "Successfully queried emails are saved in this browser and can be selected or deleted below.",
    "history.heading": "Local query history",
    "history.clear": "Clear all",
    "history.remove": "Remove {0}",
    "results.eyebrow": "Inbox",
    "results.heading": "Recent mail",
    "validation.required": "Please enter an external email address.",
    "validation.invalid": "Please enter a valid email address.",
    "status.refreshing": "Refreshing recent mail…",
    "status.querying": "Looking up recent mail…",
    "status.timeout": "The request timed out, please refresh manually.",
    "status.connectFailed": "Could not reach the query service, please retry later.",
    "results.summary": "{0} messages · {1} (Beijing time)",
    "mail.noSubject": "(no subject)",
    "mail.from": "From: {0}",
    "mail.fromUnknown": "unknown",
    "mail.noBody": "(no body)",
    "mail.viewLabel": "View as",
    "mail.viewHtml": "HTML",
    "mail.viewText": "Plain text",
    "mail.frameTitle": "Message body",
    "mail.empty": "This inbox has no mail yet.",
    "mail.receivedSent": "Received {0} · Sent {1} (Beijing time)",
    "mail.received": "Received {0} (Beijing time)",
    "mail.sent": "Sent {0} (Beijing time)",
    "mail.timeUnknown": "Time unknown",
    "badge.truncated": "Body truncated",
    "badge.parseFailed": "Body parsing failed",
    "badge.tooLarge": "Original message exceeds parsing limit",
    "badge.htmlToText": "Converted from HTML to text",
    "badge.fallback": "Body is a degraded parse result",
    "badge.htmlTruncated": "HTML body truncated",
    "badge.imagesBlocked": "{0} remote image(s) blocked",
    "error.400": "The external email format is invalid.",
    "error.404": "No matching binding was found, please check your input.",
    "error.502": "The upstream mail service is temporarily unavailable, please retry.",
    "error.503": "Query volume is high right now, please refresh manually later.",
    "error.504": "The upstream mail service timed out, please refresh manually later.",
    "error.5xx": "The query service is temporarily unavailable, please retry.",
    "error.default": "The query failed, please check your input and retry.",
  },
};

const SUPPORTED_LANGS = ["zh", "zh-Hant", "en"];
const LANG_DOC_TAG = { zh: "zh-CN", "zh-Hant": "zh-Hant", en: "en" };

// Baseline styling inside the mail frame. It only sets what the mail itself
// usually leaves to the client, so a mail's own styling still wins.
const MAIL_FRAME_CSS = `
html, body { margin: 0; padding: 0; }
body {
  font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif;
  color: #1f2937;
  background: #ffffff;
  padding: 4px 2px;
  overflow-wrap: anywhere;
  word-break: break-word;
}
img, table, pre, blockquote { max-width: 100%; }
img { height: auto; }
table { border-collapse: collapse; }
pre { white-space: pre-wrap; }
a { color: #1d4ed8; }
/* Remote images never carry a src, so they render as a labelled placeholder
   instead of a browser-default broken icon. */
img[data-nfq-blocked] {
  display: inline-block;
  min-width: 8px;
  min-height: 8px;
  padding: 1px 4px;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  background: #f8fafc;
  color: #94a3b8;
  font-size: 12px;
  font-style: italic;
}
`;
const LANG_STORAGE_KEY = "nfq_public_lang";
const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
let currentLang = SUPPORTED_LANGS.includes(storedLang) ? storedLang : "zh";

function t(key, ...args) {
  const dict = translations[currentLang] || translations.zh;
  let text = dict[key] ?? translations.zh[key] ?? key;
  args.forEach((value, index) => {
    text = text.replaceAll(`{${index}}`, String(value));
  });
  return text;
}

function applyStaticTranslations() {
  document.documentElement.lang = LANG_DOC_TAG[currentLang] || "zh-CN";
  document.title = t("page.title");
  langButtons.forEach((button) => {
    const isActive = button.dataset.lang === currentLang;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
}

function setLanguage(lang) {
  currentLang = SUPPORTED_LANGS.includes(lang) ? lang : "zh";
  localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  applyStaticTranslations();
  refreshButton.textContent = t("query.refresh");
  renderEmailHistory();
  if (!results.hidden && lastRenderedMails) {
    renderMails(lastRenderedMails);
  }
}

const langButtons = document.querySelectorAll(".lang-button");
const queryForm = document.querySelector("#query-form");
const externalIdInput = document.querySelector("#external-id");
const externalIdHistory = document.querySelector("#external-id-history");
const emailHistoryPanel = document.querySelector("#email-history-panel");
const emailHistoryList = document.querySelector("#email-history-list");
const clearEmailHistoryButton = document.querySelector("#clear-email-history");
const queryButton = document.querySelector("#query-button");
const refreshButton = document.querySelector("#refresh-button");
const statusBox = document.querySelector("#query-status");
const results = document.querySelector("#results");
const resultsSummary = document.querySelector("#results-summary");
const mailList = document.querySelector("#mail-list");

const beijingDateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

let lastSuccessfulExternalId = "";
let activeController = null;
let lastRenderedMails = null;
let successfulExternalIds = loadEmailHistory(localStorage);

applyStaticTranslations();
renderEmailHistory();
if (!externalIdInput.value && successfulExternalIds.length > 0) {
  externalIdInput.value = successfulExternalIds[0];
}

langButtons.forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

queryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const externalId = externalIdInput.value.trim();
  if (!validateExternalId(externalId)) {
    return;
  }
  void runQuery(externalId, false);
});

refreshButton.addEventListener("click", () => {
  if (canRefresh()) {
    void runQuery(lastSuccessfulExternalId, true);
  }
});

externalIdInput.addEventListener("input", () => {
  if (!activeController) {
    refreshButton.disabled = !canRefresh();
  }
});

clearEmailHistoryButton.addEventListener("click", () => {
  successfulExternalIds = clearEmailHistory(localStorage);
  renderEmailHistory();
});

function validateExternalId(value) {
  externalIdInput.setCustomValidity("");
  if (!value) {
    externalIdInput.setCustomValidity(t("validation.required"));
  } else if (value.length > 254 || !externalIdInput.checkValidity()) {
    externalIdInput.setCustomValidity(t("validation.invalid"));
  }

  if (!externalIdInput.reportValidity()) {
    return false;
  }
  return true;
}

async function runQuery(externalId, isRefresh) {
  if (activeController) {
    activeController.abort();
  }

  const controller = new AbortController();
  activeController = controller;
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);
  if (!isRefresh && externalId !== lastSuccessfulExternalId) {
    results.hidden = true;
  }
  setBusy(true, isRefresh);
  showStatus(isRefresh ? t("status.refreshing") : t("status.querying"), "busy");

  try {
    const response = await fetch("/api/query", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ external_id: externalId }),
      signal: controller.signal,
    });

    const payload = await readResponse(response);
    if (!response.ok || (isRecord(payload) && payload.ok === false)) {
      throw new RequestError(response.status, errorMessage(payload));
    }

    const mails = extractMails(payload).slice(0, 10);
    const responseData = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
    const refreshedAt = isRecord(responseData) ? responseData.refreshed_at : null;
    renderMails(mails);
    lastSuccessfulExternalId = externalId;
    successfulExternalIds = rememberSuccessfulEmail(
      localStorage,
      externalId,
      successfulExternalIds,
    );
    renderEmailHistory();
    refreshButton.disabled = false;
    results.hidden = false;
    resultsSummary.textContent = t("results.summary", mails.length, formatDate(refreshedAt) || formatDate(new Date()));
    hideStatus();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (activeController === controller) {
        showStatus(t("status.timeout"), "error");
      }
      return;
    }

    const message = error instanceof RequestError
      ? publicErrorMessage(error)
      : t("status.connectFailed");
    showStatus(message, "error");
  } finally {
    window.clearTimeout(timeoutId);
    if (activeController === controller) {
      activeController = null;
      setBusy(false, false);
    }
  }
}

function renderEmailHistory() {
  externalIdHistory.replaceChildren();
  emailHistoryList.replaceChildren();
  emailHistoryPanel.hidden = successfulExternalIds.length === 0;

  for (const email of successfulExternalIds) {
    const option = document.createElement("option");
    option.value = email;
    externalIdHistory.append(option);

    const item = document.createElement("li");
    item.className = "email-history-item";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "email-history-select";
    selectButton.textContent = email;
    selectButton.addEventListener("click", () => {
      if (activeController) return;
      externalIdInput.value = email;
      externalIdInput.dispatchEvent(new Event("input", { bubbles: true }));
      externalIdInput.focus();
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "email-history-remove";
    removeButton.setAttribute("aria-label", t("history.remove", email));
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => {
      successfulExternalIds = removeSuccessfulEmail(
        localStorage,
        email,
        successfulExternalIds,
      );
      renderEmailHistory();
    });

    item.append(selectButton, removeButton);
    emailHistoryList.append(item);
  }
}

function setBusy(busy, isRefresh) {
  externalIdInput.disabled = busy;
  queryButton.disabled = busy;
  refreshButton.disabled = busy || !canRefresh();
  queryButton.textContent = busy && !isRefresh ? t("query.submitBusy") : t("query.submit");
  refreshButton.textContent = busy && isRefresh ? t("query.refreshBusy") : t("query.refresh");
  queryForm.setAttribute("aria-busy", String(busy));
}

function canRefresh() {
  return Boolean(lastSuccessfulExternalId)
    && externalIdInput.value.trim() === lastSuccessfulExternalId;
}

function renderMails(mails) {
  lastRenderedMails = mails;
  mailList.replaceChildren();

  if (mails.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = t("mail.empty");
    mailList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const mail of mails) {
    fragment.append(createMailCard(mail));
  }
  mailList.append(fragment);
}

function createMailCard(mail) {
  const item = document.createElement("li");
  item.className = "mail-card";

  const head = document.createElement("div");
  head.className = "mail-head";

  const subject = document.createElement("h3");
  subject.className = "mail-subject";
  subject.textContent = safeText(mail.subject) || t("mail.noSubject");

  const time = document.createElement("p");
  time.className = "mail-time";
  time.textContent = displayMailTime(mail);

  const from = document.createElement("p");
  from.className = "mail-from";
  from.textContent = t("mail.from", formatSender(mail.from ?? mail.from_address ?? mail.sender) || t("mail.fromUnknown"));

  head.append(subject, time, from);
  item.append(head);

  const badges = mailBadges(mail);
  if (badges.length > 0) {
    const badgeRow = document.createElement("div");
    badgeRow.className = "mail-badges";
    for (const label of badges) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = label;
      badgeRow.append(badge);
    }
    item.append(badgeRow);
  }

  item.append(createMailBody(mail));
  return item;
}

// HTML is the default view whenever the server produced a sanitized body; the
// plain-text view stays reachable and is the only view for text-only mail.
function createMailBody(mail) {
  const html = safeText(mail.body_html);
  const text = safeText(mail.body_text ?? mail.text);

  if (!html) {
    const body = document.createElement("p");
    body.className = "mail-body";
    body.textContent = text || t("mail.noBody");
    return body;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "mail-body-views";

  const frame = createMailFrame(html);
  const textBody = document.createElement("p");
  textBody.className = "mail-body";
  textBody.textContent = text || t("mail.noBody");
  textBody.hidden = true;

  const showText = () => {
    if (frame.hidden || !text) return;
    frame.hidden = true;
    textBody.hidden = false;
    for (const button of wrapper.querySelectorAll(".view-button")) {
      const active = button.dataset.view === "text";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  };

  if (text) {
    wrapper.append(createViewSwitch(frame, textBody));
  }
  wrapper.append(frame, textBody);

  // A browser that refuses to render the frame at all (an unexpectedly strict
  // CSP, an extension) would otherwise leave a blank card, so an unreadable or
  // empty frame falls back to the text body on its own.
  frame.addEventListener("load", () => {
    if (!frameHasContent(frame)) showText();
  });
  window.setTimeout(() => {
    if (!frame.hidden && !frameHasContent(frame)) showText();
  }, 2000);

  return wrapper;
}

function frameHasContent(frame) {
  try {
    const body = frame.contentDocument?.body;
    if (!body) return false;
    return body.childElementCount > 0 || body.textContent.trim().length > 0;
  } catch {
    // Unreadable means the frame is not same-origin as expected; the mail may
    // still be rendering fine, so this is not treated as a failure.
    return true;
  }
}

function createViewSwitch(frame, textBody) {
  const group = document.createElement("div");
  group.className = "view-switch";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", t("mail.viewLabel"));

  const views = [
    { key: "mail.viewHtml", view: "html", showFrame: true },
    { key: "mail.viewText", view: "text", showFrame: false },
  ];
  const buttons = views.map(({ key, view, showFrame }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "view-button";
    button.dataset.view = view;
    button.textContent = t(key);
    button.classList.toggle("is-active", showFrame);
    button.setAttribute("aria-pressed", String(showFrame));
    button.addEventListener("click", () => {
      frame.hidden = !showFrame;
      textBody.hidden = showFrame;
      for (const other of buttons) {
        const active = other === button;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", String(active));
      }
      // A frame that was hidden on load measured as empty, so re-fit it.
      if (showFrame) fitFrame(frame);
    });
    return button;
  });

  group.append(...buttons);
  return group;
}

function createMailFrame(html) {
  const frame = document.createElement("iframe");
  frame.className = "mail-frame";
  frame.title = t("mail.frameTitle");
  frame.loading = "lazy";
  // No `allow-scripts`: nothing inside the mail can execute, which is the
  // guarantee the whole HTML view rests on. `allow-same-origin` only lets this
  // page measure the rendered height, and `allow-popups` lets a clicked link
  // open in a new tab instead of dead-ending.
  frame.setAttribute(
    "sandbox",
    "allow-same-origin allow-popups allow-popups-to-escape-sandbox",
  );
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.addEventListener("load", () => fitFrame(frame));
  frame.srcdoc = mailDocument(html);
  return frame;
}

function mailDocument(html) {
  return `<!doctype html><html lang="${escapeHtml(LANG_DOC_TAG[currentLang] || "zh-CN")}"><head>`
    + '<meta charset="utf-8">'
    + '<meta name="referrer" content="no-referrer">'
    + '<base target="_blank">'
    + `<style>${MAIL_FRAME_CSS}</style>`
    + `</head><body>${html}</body></html>`;
}

function fitFrame(frame) {
  if (frame.hidden) return;
  try {
    const doc = frame.contentDocument;
    if (!doc) return;
    const height = Math.max(
      doc.documentElement?.scrollHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
    );
    // Clamped so a malformed mail cannot stretch the page without bound; the
    // frame scrolls internally past the ceiling.
    frame.style.height = `${Math.min(Math.max(height, 60), 12000)}px`;
  } catch {
    // A frame we cannot measure keeps its CSS fallback height and scrolls.
  }
}

let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    for (const frame of mailList.querySelectorAll(".mail-frame")) {
      fitFrame(frame);
    }
  }, 150);
});

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function displayMailTime(mail) {
  const received = formatDate(mail.received_at ?? mail.receivedAt ?? mail.created_at);
  const sent = formatDate(mail.sent_at ?? mail.sentAt);
  if (received && sent) {
    return t("mail.receivedSent", received, sent);
  }
  if (received) {
    return t("mail.received", received);
  }
  if (sent) {
    return t("mail.sent", sent);
  }
  return t("mail.timeUnknown");
}

function mailBadges(mail) {
  const labels = [];
  const hasHtml = Boolean(safeText(mail.body_html));
  if (mail.truncated === true || mail.body_truncated === true) {
    labels.push(t("badge.truncated"));
  }
  if (mail.html_truncated === true) {
    labels.push(t("badge.htmlTruncated"));
  }
  if (Number.isFinite(mail.blocked_images) && mail.blocked_images > 0) {
    labels.push(t("badge.imagesBlocked", mail.blocked_images));
  }

  const parseStatus = safeText(mail.parse_status ?? mail.parsing_status).toLowerCase();
  if (["failed", "error", "parse_failed", "parse_error"].includes(parseStatus)) {
    labels.push(t("badge.parseFailed"));
  } else if (parseStatus === "too_large") {
    labels.push(t("badge.tooLarge"));
  } else if (parseStatus === "html_to_text" && !hasHtml) {
    // With a rendered HTML body the text-only conversion is just the fallback
    // view, not a degradation worth flagging.
    labels.push(t("badge.htmlToText"));
  } else if (["partial", "fallback", "raw_fallback"].includes(parseStatus)) {
    labels.push(t("badge.fallback"));
  }
  return labels;
}

function extractMails(payload) {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.mails, payload.messages, payload.items, payload.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
    if (isRecord(candidate)) {
      const nested = candidate.mails ?? candidate.messages ?? candidate.items;
      if (Array.isArray(nested)) {
        return nested.filter(isRecord);
      }
    }
  }
  return [];
}

function formatSender(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(formatSender).filter(Boolean).join(", ");
  }
  if (isRecord(value)) {
    const name = safeText(value.name);
    const address = safeText(value.address ?? value.email);
    if (name && address) {
      return `${name} <${address}>`;
    }
    return address || name;
  }
  return "";
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return beijingDateTime.format(date).replaceAll("/", "-");
}

function safeText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return { message: await response.text() };
  } catch {
    return null;
  }
}

function errorMessage(payload) {
  if (!isRecord(payload)) {
    return "";
  }
  if (typeof payload.message === "string") {
    return payload.message;
  }
  if (typeof payload.error === "string") {
    return payload.error;
  }
  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  return "";
}

function publicErrorMessage(error) {
  switch (error.status) {
    case 400:
      return error.detail || t("error.400");
    case 404:
      return t("error.404");
    case 502:
      return t("error.502");
    case 503:
      return t("error.503");
    case 504:
      return t("error.504");
    default:
      return error.status >= 500
        ? t("error.5xx")
        : error.detail || t("error.default");
  }
}

function showStatus(message, kind) {
  statusBox.textContent = message;
  statusBox.dataset.kind = kind;
  statusBox.hidden = false;
}

function hideStatus() {
  statusBox.textContent = "";
  delete statusBox.dataset.kind;
  statusBox.hidden = true;
}

class RequestError extends Error {
  constructor(status, detail) {
    super(detail || `HTTP ${status}`);
    this.name = "RequestError";
    this.status = status;
    this.detail = detail;
  }
}
