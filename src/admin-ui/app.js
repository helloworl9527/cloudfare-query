"use strict";

const translations = {
  zh: {
    "admin.title": "query · 管理",
    "admin.brandAriaLabel": "query 管理首页",
    "admin.areaLabel": "管理员",
    "login.eyebrow": "受保护区域",
    "login.heading": "管理员登录",
    "login.intro": "使用 query 应用密码继续。登录会话最长有效 8 小时。",
    "login.passwordLabel": "应用密码",
    "login.submit": "登录",
    "bindings.eyebrow": "绑定管理",
    "bindings.heading": "邮箱绑定",
    "bindings.logout": "退出登录",
    "create.heading": "创建绑定",
    "create.intro": "关联一个外部邮箱和一段地址 JWT。",
    "create.externalIdLabel": "外部邮箱",
    "create.jwtLabel": "地址 JWT",
    "create.jwtPlaceholder": "从上游后台 show_password 取得的地址 JWT",
    "create.jwtHelp": "query 不存储上游管理员密码；请手动从上游后台取出该临时邮箱的 JWT 并粘贴到此处，临时邮箱地址会从 JWT 中自动解析，系统会向上游校验后再保存。",
    "create.noteLabel": "备注",
    "create.submit": "创建并校验凭据",
    "common.optional": "可选",
    "list.heading": "已有绑定",
    "list.loading": "正在读取…",
    "list.reload": "刷新列表",
    "list.searchLabel": "搜索绑定",
    "list.searchPlaceholder": "搜索外部邮箱、临时邮箱或备注",
    "list.search": "搜索",
    "list.clear": "清除",
    "list.empty": "暂无匹配的绑定。",
    "list.previous": "上一页",
    "list.next": "下一页",
    "table.externalId": "外部邮箱",
    "table.address": "临时邮箱",
    "table.credential": "凭据",
    "table.noteUpdated": "备注 / 更新",
    "table.actions": "操作",
    "edit.eyebrow": "编辑绑定",
    "edit.heading": "更新绑定信息",
    "edit.closeAriaLabel": "关闭编辑窗口",
    "edit.externalIdLabel": "外部邮箱",
    "edit.addressLabel": "当前临时邮箱",
    "edit.addressHelp": "临时邮箱地址由地址 JWT 决定，不能直接编辑；如需更换邮箱，在下方粘贴新邮箱对应的 JWT 即可自动更新。",
    "edit.jwtLabel": "地址 JWT",
    "edit.jwtOptional": "仅更换凭据/邮箱时填写",
    "edit.jwtPlaceholder": "留空则不更改凭据；粘贴新 JWT 可更新凭据，也可用来更换绑定的临时邮箱",
    "edit.noteLabel": "备注",
    "edit.cancel": "取消",
    "edit.save": "保存更改",
    "action.edit": "编辑",
    "action.test": "测试",
    "action.replace": "更新凭据",
    "action.delete": "删除",
    "row.idVersion": "ID {0} · v{1}",
    "row.noNote": "无备注",
    "row.updatedAt": "更新于 {0}（北京时间）",
    "row.updatedUnknown": "更新时间未知",
    "row.dash": "—",
    "status.active": "可用",
    "status.valid": "可用",
    "status.ready": "可用",
    "status.ok": "可用",
    "status.pending": "待获取",
    "status.missing": "未获取",
    "status.stale": "需重新获取",
    "status.invalid": "无效",
    "status.failed": "获取失败",
    "status.error": "异常",
    "status.unknown": "未知",
    "page.label": "第 {0} 页",
    "session.expiry": "当前会话有效至 {0}（北京时间）",
    "session.active": "当前会话已登录",
    "list.foundCount": "找到 {0} 条，当前显示 {1}–{2}",
    "list.totalCount": "共 {0} 条，当前显示 {1}–{2}",
    "list.noMatch": "没有匹配结果",
    "list.shownRange": "当前显示 {0}–{1}",
    "login.validating": "正在验证…",
    "login.signingIn": "登录中…",
    "login.failed": "登录失败，请检查密码。",
    "logout.success": "已安全退出。",
    "logout.failed": "退出失败，请重试。",
    "create.creating": "创建中…",
    "create.busy": "正在创建绑定并向上游校验粘贴的 JWT…",
    "create.success": "绑定已创建，凭据已安全保存。",
    "create.failed": "创建绑定失败。",
    "list.loadFailed": "读取绑定列表失败。",
    "row.changed": "列表已经变化，请刷新后重试。",
    "edit.staleRecord": "绑定已经变化，请关闭窗口并刷新列表。",
    "edit.saving": "正在保存…",
    "edit.saved": "绑定已更新。",
    "edit.saveFailed": "保存失败。",
    "test.testing": "测试中…",
    "test.passed": "绑定测试通过{0}。",
    "test.mailCount": "，上游返回 {0} 封邮件",
    "test.failed": "绑定测试失败。",
    "replace.prompt": "粘贴该临时邮箱最新的地址 JWT。系统会向上游校验后替换旧凭据，旧 JWT 不会被撤销。",
    "replace.cancelled": "未输入 JWT，已取消。",
    "replace.verifying": "校验中…",
    "replace.success": "凭据已更新并通过上游自检。",
    "replace.failed": "更新凭据失败。",
    "delete.confirm": "确定删除 {0}？此操作只删除 query 本地记录，不会删除上游邮箱。",
    "delete.fallbackName": "此绑定",
    "delete.deleting": "删除中…",
    "delete.success": "本地绑定已删除；上游邮箱未被删除。",
    "delete.failed": "删除绑定失败。",
    "error.network": "无法连接管理服务，请检查网络后重试。",
    "error.401": "密码错误或会话已经失效。",
    "error.403": "安全校验失败，请刷新页面并重新登录。",
    "error.409": "记录已被其他操作更新，请刷新列表后重试。",
    "error.429": "登录失败次数过多，请稍后再试。",
    "error.5xx": "管理服务暂时不可用，请稍后重试。",
    "error.requestId": "（请求编号：{0}）",
  },
  "zh-Hant": {
    "admin.title": "query · 管理",
    "admin.brandAriaLabel": "query 管理首頁",
    "admin.areaLabel": "管理員",
    "login.eyebrow": "受保護區域",
    "login.heading": "管理員登入",
    "login.intro": "使用 query 應用程式密碼繼續。登入工作階段最長有效 8 小時。",
    "login.passwordLabel": "應用程式密碼",
    "login.submit": "登入",
    "bindings.eyebrow": "綁定管理",
    "bindings.heading": "郵箱綁定",
    "bindings.logout": "登出",
    "create.heading": "建立綁定",
    "create.intro": "關聯一個外部郵箱和一段地址 JWT。",
    "create.externalIdLabel": "外部郵箱",
    "create.jwtLabel": "地址 JWT",
    "create.jwtPlaceholder": "從上游後台 show_password 取得的地址 JWT",
    "create.jwtHelp": "query 不儲存上游管理員密碼；請手動從上游後台取出該臨時郵箱的 JWT 並貼上到此處，臨時郵箱地址會從 JWT 中自動解析，系統會向上游驗證後再儲存。",
    "create.noteLabel": "備註",
    "create.submit": "建立並驗證憑證",
    "common.optional": "可選",
    "list.heading": "現有綁定",
    "list.loading": "正在讀取…",
    "list.reload": "重新整理清單",
    "list.searchLabel": "搜尋綁定",
    "list.searchPlaceholder": "搜尋外部郵箱、臨時郵箱或備註",
    "list.search": "搜尋",
    "list.clear": "清除",
    "list.empty": "暫無符合的綁定。",
    "list.previous": "上一頁",
    "list.next": "下一頁",
    "table.externalId": "外部郵箱",
    "table.address": "臨時郵箱",
    "table.credential": "憑證",
    "table.noteUpdated": "備註 / 更新",
    "table.actions": "操作",
    "edit.eyebrow": "編輯綁定",
    "edit.heading": "更新綁定資訊",
    "edit.closeAriaLabel": "關閉編輯視窗",
    "edit.externalIdLabel": "外部郵箱",
    "edit.addressLabel": "目前臨時郵箱",
    "edit.addressHelp": "臨時郵箱地址由地址 JWT 決定，無法直接編輯；如需更換郵箱，在下方貼上新郵箱對應的 JWT 即可自動更新。",
    "edit.jwtLabel": "地址 JWT",
    "edit.jwtOptional": "僅更換憑證/郵箱時填寫",
    "edit.jwtPlaceholder": "留空則不變更憑證；貼上新 JWT 可更新憑證，也可用來更換綁定的臨時郵箱",
    "edit.noteLabel": "備註",
    "edit.cancel": "取消",
    "edit.save": "儲存變更",
    "action.edit": "編輯",
    "action.test": "測試",
    "action.replace": "更新憑證",
    "action.delete": "刪除",
    "row.idVersion": "ID {0} · v{1}",
    "row.noNote": "無備註",
    "row.updatedAt": "更新於 {0}（北京時間）",
    "row.updatedUnknown": "更新時間未知",
    "row.dash": "—",
    "status.active": "可用",
    "status.valid": "可用",
    "status.ready": "可用",
    "status.ok": "可用",
    "status.pending": "待取得",
    "status.missing": "未取得",
    "status.stale": "需重新取得",
    "status.invalid": "無效",
    "status.failed": "取得失敗",
    "status.error": "異常",
    "status.unknown": "未知",
    "page.label": "第 {0} 頁",
    "session.expiry": "目前工作階段有效至 {0}（北京時間）",
    "session.active": "目前工作階段已登入",
    "list.foundCount": "找到 {0} 筆，目前顯示 {1}–{2}",
    "list.totalCount": "共 {0} 筆，目前顯示 {1}–{2}",
    "list.noMatch": "沒有符合的結果",
    "list.shownRange": "目前顯示 {0}–{1}",
    "login.validating": "正在驗證…",
    "login.signingIn": "登入中…",
    "login.failed": "登入失敗，請檢查密碼。",
    "logout.success": "已安全登出。",
    "logout.failed": "登出失敗，請重試。",
    "create.creating": "建立中…",
    "create.busy": "正在建立綁定並向上游驗證貼上的 JWT…",
    "create.success": "綁定已建立，憑證已安全儲存。",
    "create.failed": "建立綁定失敗。",
    "list.loadFailed": "讀取綁定清單失敗。",
    "row.changed": "清單已經變化，請重新整理後重試。",
    "edit.staleRecord": "綁定已經變化，請關閉視窗並重新整理清單。",
    "edit.saving": "正在儲存…",
    "edit.saved": "綁定已更新。",
    "edit.saveFailed": "儲存失敗。",
    "test.testing": "測試中…",
    "test.passed": "綁定測試通過{0}。",
    "test.mailCount": "，上游傳回 {0} 封郵件",
    "test.failed": "綁定測試失敗。",
    "replace.prompt": "貼上該臨時郵箱最新的地址 JWT。系統會向上游驗證後取代舊憑證，舊 JWT 不會被撤銷。",
    "replace.cancelled": "未輸入 JWT，已取消。",
    "replace.verifying": "驗證中…",
    "replace.success": "憑證已更新並通過上游自我檢查。",
    "replace.failed": "更新憑證失敗。",
    "delete.confirm": "確定刪除 {0}？此操作僅刪除 query 本機記錄，不會刪除上游郵箱。",
    "delete.fallbackName": "此綁定",
    "delete.deleting": "刪除中…",
    "delete.success": "本機綁定已刪除；上游郵箱未被刪除。",
    "delete.failed": "刪除綁定失敗。",
    "error.network": "無法連線管理服務，請檢查網路後重試。",
    "error.401": "密碼錯誤或工作階段已經失效。",
    "error.403": "安全檢查失敗，請重新整理頁面並重新登入。",
    "error.409": "記錄已被其他操作更新，請重新整理清單後重試。",
    "error.429": "登入失敗次數過多，請稍後再試。",
    "error.5xx": "管理服務暫時無法使用，請稍後重試。",
    "error.requestId": "（請求編號：{0}）",
  },
  en: {
    "admin.title": "query · Admin",
    "admin.brandAriaLabel": "query admin home",
    "admin.areaLabel": "Admin",
    "login.eyebrow": "Protected area",
    "login.heading": "Admin sign in",
    "login.intro": "Continue with the query application password. Sessions last up to 8 hours.",
    "login.passwordLabel": "Application password",
    "login.submit": "Sign in",
    "bindings.eyebrow": "Binding management",
    "bindings.heading": "Mailbox bindings",
    "bindings.logout": "Sign out",
    "create.heading": "Create binding",
    "create.intro": "Link an external email address to an address JWT.",
    "create.externalIdLabel": "External email",
    "create.jwtLabel": "Address JWT",
    "create.jwtPlaceholder": "Address JWT from upstream's show_password",
    "create.jwtHelp": "query no longer stores the upstream admin password. Paste the mailbox's JWT taken from the upstream admin panel; the temporary mailbox address is parsed from the JWT automatically and verified against upstream before saving.",
    "create.noteLabel": "Note",
    "create.submit": "Create and verify credential",
    "common.optional": "optional",
    "list.heading": "Existing bindings",
    "list.loading": "Loading…",
    "list.reload": "Reload list",
    "list.searchLabel": "Search bindings",
    "list.searchPlaceholder": "Search external email, mailbox or note",
    "list.search": "Search",
    "list.clear": "Clear",
    "list.empty": "No matching bindings.",
    "list.previous": "Previous",
    "list.next": "Next",
    "table.externalId": "External email",
    "table.address": "Temporary mailbox",
    "table.credential": "Credential",
    "table.noteUpdated": "Note / updated",
    "table.actions": "Actions",
    "edit.eyebrow": "Edit binding",
    "edit.heading": "Update binding",
    "edit.closeAriaLabel": "Close edit dialog",
    "edit.externalIdLabel": "External email",
    "edit.addressLabel": "Current temporary mailbox",
    "edit.addressHelp": "The mailbox address is derived from the address JWT and can't be edited directly; to move this binding to a different mailbox, paste that mailbox's JWT below and it updates automatically.",
    "edit.jwtLabel": "Address JWT",
    "edit.jwtOptional": "only needed to change the credential or mailbox",
    "edit.jwtPlaceholder": "Leave blank to keep the current credential; paste a new JWT to refresh it or move this binding to another mailbox",
    "edit.noteLabel": "Note",
    "edit.cancel": "Cancel",
    "edit.save": "Save changes",
    "action.edit": "Edit",
    "action.test": "Test",
    "action.replace": "Update credential",
    "action.delete": "Delete",
    "row.idVersion": "ID {0} · v{1}",
    "row.noNote": "No note",
    "row.updatedAt": "Updated {0} (Beijing time)",
    "row.updatedUnknown": "Update time unknown",
    "row.dash": "—",
    "status.active": "Active",
    "status.valid": "Active",
    "status.ready": "Active",
    "status.ok": "Active",
    "status.pending": "Pending",
    "status.missing": "Missing",
    "status.stale": "Needs refresh",
    "status.invalid": "Invalid",
    "status.failed": "Fetch failed",
    "status.error": "Error",
    "status.unknown": "Unknown",
    "page.label": "Page {0}",
    "session.expiry": "Session valid until {0} (Beijing time)",
    "session.active": "Session active",
    "list.foundCount": "Found {0}, showing {1}–{2}",
    "list.totalCount": "{0} total, showing {1}–{2}",
    "list.noMatch": "No matching results",
    "list.shownRange": "Showing {0}–{1}",
    "login.validating": "Verifying…",
    "login.signingIn": "Signing in…",
    "login.failed": "Sign-in failed, please check the password.",
    "logout.success": "Signed out.",
    "logout.failed": "Sign-out failed, please retry.",
    "create.creating": "Creating…",
    "create.busy": "Creating the binding and verifying the pasted JWT with upstream…",
    "create.success": "Binding created; the credential is stored securely.",
    "create.failed": "Failed to create binding.",
    "list.loadFailed": "Failed to load the binding list.",
    "row.changed": "The list has changed, please reload and retry.",
    "edit.staleRecord": "This binding has changed; please close the dialog and reload the list.",
    "edit.saving": "Saving…",
    "edit.saved": "Binding updated.",
    "edit.saveFailed": "Save failed.",
    "test.testing": "Testing…",
    "test.passed": "Binding test passed{0}.",
    "test.mailCount": "; upstream returned {0} mails",
    "test.failed": "Binding test failed.",
    "replace.prompt": "Paste the mailbox's latest address JWT. It will be verified against upstream before replacing the old credential; the old JWT is not revoked.",
    "replace.cancelled": "No JWT entered; cancelled.",
    "replace.verifying": "Verifying…",
    "replace.success": "Credential updated and verified against upstream.",
    "replace.failed": "Failed to update credential.",
    "delete.confirm": "Delete {0}? This only removes the local query record, not the upstream mailbox.",
    "delete.fallbackName": "this binding",
    "delete.deleting": "Deleting…",
    "delete.success": "Local binding deleted; the upstream mailbox is untouched.",
    "delete.failed": "Failed to delete binding.",
    "error.network": "Could not reach the admin service, please check your connection.",
    "error.401": "Wrong password or the session has expired.",
    "error.403": "Security check failed, please reload and sign in again.",
    "error.409": "This record changed elsewhere; reload the list and retry.",
    "error.429": "Too many failed sign-in attempts, please try again later.",
    "error.5xx": "Admin service is temporarily unavailable, please retry.",
    "error.requestId": " (request ID: {0})",
  },
};

const SUPPORTED_LANGS = ["zh", "zh-Hant", "en"];
const LANG_DOC_TAG = { zh: "zh-CN", "zh-Hant": "zh-Hant", en: "en" };
const LANG_STORAGE_KEY = "nfq_admin_lang";
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
  document.title = t("admin.title");
  langButtons.forEach((button) => {
    const isActive = button.dataset.lang === currentLang;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
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
  if (!adminView.hidden) {
    renderBindings(Array.from(state.bindings.values()));
  }
}

const loginView = document.querySelector("#login-view");
const adminView = document.querySelector("#admin-view");
const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const passwordInput = document.querySelector("#admin-password");
const loginStatus = document.querySelector("#login-status");
const logoutButton = document.querySelector("#logout-button");
const sessionExpiry = document.querySelector("#session-expiry");
const globalStatus = document.querySelector("#global-status");
const langButtons = document.querySelectorAll(".lang-button");

const createForm = document.querySelector("#create-form");
const createButton = document.querySelector("#create-button");
const createExternalId = document.querySelector("#create-external-id");
const createAddressJwt = document.querySelector("#create-address-jwt");
const createNote = document.querySelector("#create-note");

const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const clearSearchButton = document.querySelector("#clear-search-button");
const reloadButton = document.querySelector("#reload-button");
const bindingsBody = document.querySelector("#bindings-body");
const bindingCount = document.querySelector("#binding-count");
const emptyBindings = document.querySelector("#empty-bindings");
const previousPage = document.querySelector("#previous-page");
const nextPage = document.querySelector("#next-page");
const pageLabel = document.querySelector("#page-label");

const editDialog = document.querySelector("#edit-dialog");
const editForm = document.querySelector("#edit-form");
const editId = document.querySelector("#edit-id");
const editVersion = document.querySelector("#edit-version");
const editExternalId = document.querySelector("#edit-external-id");
const editAddress = document.querySelector("#edit-address");
const editAddressJwt = document.querySelector("#edit-address-jwt");
const editNote = document.querySelector("#edit-note");
const editSaveButton = document.querySelector("#edit-save-button");
const editCancelButton = document.querySelector("#edit-cancel-button");
const editCloseButton = document.querySelector("#edit-close-button");
const editStatus = document.querySelector("#edit-status");

const pageSize = 50;
const state = {
  csrfToken: "",
  bindings: new Map(),
  search: "",
  offset: 0,
  total: null,
  loading: false,
};

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

applyStaticTranslations();

langButtons.forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void login();
});

logoutButton.addEventListener("click", () => void logout());
createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void createBinding();
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.search = searchInput.value.trim();
  state.offset = 0;
  void loadBindings();
});

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  state.search = "";
  state.offset = 0;
  void loadBindings();
});

reloadButton.addEventListener("click", () => void loadBindings());
previousPage.addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - pageSize);
  void loadBindings();
});
nextPage.addEventListener("click", () => {
  state.offset += pageSize;
  void loadBindings();
});

bindingsBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action][data-binding-key]");
  if (!button || !(button instanceof HTMLButtonElement)) {
    return;
  }
  const binding = state.bindings.get(button.dataset.bindingKey || "");
  if (!binding) {
    showNotice(globalStatus, t("row.changed"), "error");
    return;
  }
  void handleBindingAction(button.dataset.action, binding, button);
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveBinding();
});

editCancelButton.addEventListener("click", closeEditDialog);
editCloseButton.addEventListener("click", closeEditDialog);
editDialog.addEventListener("click", (event) => {
  if (event.target === editDialog) {
    closeEditDialog();
  }
});

void bootstrap();

async function bootstrap() {
  try {
    const data = await api("/admin/api/session", { method: "POST", body: {}, authRequired: false });
    acceptSession(data);
    showAdmin(data);
    await loadBindings();
  } catch (error) {
    if (error instanceof ApiError && error.status !== 401) {
      showLogin(t("error.network"), "error");
      return;
    }
    showLogin();
  }
}

async function login() {
  if (!loginForm.reportValidity()) {
    return;
  }
  loginButton.disabled = true;
  loginButton.textContent = t("login.signingIn");
  showNotice(loginStatus, t("login.validating"), "busy");

  try {
    let data = await api("/admin/api/login", {
      method: "POST",
      body: { password: passwordInput.value },
      authRequired: false,
    });
    passwordInput.value = "";
    acceptSession(data);
    if (!state.csrfToken) {
      data = await api("/admin/api/session", { method: "POST", body: {}, authRequired: false });
      acceptSession(data);
    }
    showAdmin(data);
    await loadBindings();
  } catch (error) {
    passwordInput.select();
    showNotice(loginStatus, adminErrorMessage(error, t("login.failed")), "error");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = t("login.submit");
  }
}

async function logout() {
  logoutButton.disabled = true;
  try {
    await api("/admin/api/logout", { method: "POST", body: {} });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) {
      showNotice(globalStatus, adminErrorMessage(error, t("logout.failed")), "error");
      logoutButton.disabled = false;
      return;
    }
  }
  state.csrfToken = "";
  state.bindings.clear();
  showLogin(t("logout.success"), "success");
  logoutButton.disabled = false;
}

async function createBinding() {
  if (!createForm.reportValidity()) {
    return;
  }
  createButton.disabled = true;
  createButton.textContent = t("create.creating");
  showNotice(globalStatus, t("create.busy"), "busy");

  try {
    await api("/admin/api/bindings", {
      method: "POST",
      body: {
        external_id: createExternalId.value.trim(),
        address_jwt: createAddressJwt.value.trim(),
        note: createNote.value.trim(),
      },
    });
    createForm.reset();
    state.offset = 0;
    showNotice(globalStatus, t("create.success"), "success");
    await loadBindings({ preserveNotice: true });
  } catch (error) {
    showNotice(globalStatus, adminErrorMessage(error, t("create.failed")), "error");
  } finally {
    createButton.disabled = false;
    createButton.textContent = t("create.submit");
  }
}

async function loadBindings(options = {}) {
  if (state.loading) {
    return;
  }
  state.loading = true;
  setListBusy(true);
  if (!options.preserveNotice) {
    hideNotice(globalStatus);
  }

  try {
    const data = await api("/admin/api/bindings/search", {
      method: "POST",
      body: { search: state.search, limit: pageSize, offset: state.offset },
    });
    const records = extractBindings(data);
    state.total = extractTotal(data);
    renderBindings(records);
  } catch (error) {
    showNotice(globalStatus, adminErrorMessage(error, t("list.loadFailed")), "error");
  } finally {
    state.loading = false;
    setListBusy(false);
  }
}

function renderBindings(records) {
  bindingsBody.replaceChildren();
  state.bindings.clear();

  const fragment = document.createDocumentFragment();
  records.forEach((binding, index) => {
    const key = `${safeText(binding.id)}:${index}`;
    state.bindings.set(key, binding);
    fragment.append(createBindingRow(binding, key));
  });
  bindingsBody.append(fragment);

  emptyBindings.hidden = records.length !== 0;
  const shownStart = records.length === 0 ? 0 : state.offset + 1;
  const shownEnd = state.offset + records.length;
  if (state.total !== null) {
    bindingCount.textContent = state.search
      ? t("list.foundCount", state.total, shownStart, shownEnd)
      : t("list.totalCount", state.total, shownStart, shownEnd);
  } else {
    bindingCount.textContent = records.length === 0
      ? t("list.noMatch")
      : t("list.shownRange", shownStart, shownEnd);
  }

  const page = Math.floor(state.offset / pageSize) + 1;
  pageLabel.textContent = t("page.label", page);
  previousPage.disabled = state.offset === 0;
  nextPage.disabled = state.total !== null
    ? shownEnd >= state.total
    : records.length < pageSize;
}

function createBindingRow(binding, key) {
  const row = document.createElement("tr");

  const externalCell = document.createElement("td");
  const external = document.createElement("span");
  external.className = "cell-primary";
  external.textContent = safeText(binding.external_id) || t("row.dash");
  const id = document.createElement("span");
  id.className = "cell-secondary";
  id.textContent = t("row.idVersion", safeText(binding.id) || t("row.dash"), safeText(binding.version) || "0");
  externalCell.append(external, id);

  const addressCell = document.createElement("td");
  addressCell.textContent = safeText(binding.address) || t("row.dash");

  const statusCell = document.createElement("td");
  const status = document.createElement("span");
  const statusInfo = credentialStatus(binding.status ?? binding.credential_status);
  status.className = "credential-status";
  status.dataset.kind = statusInfo.kind;
  status.textContent = statusInfo.label;
  statusCell.append(status);

  const detailsCell = document.createElement("td");
  const note = document.createElement("span");
  note.textContent = safeText(binding.note) || t("row.noNote");
  const updated = document.createElement("span");
  updated.className = "cell-secondary";
  const updatedAt = formatDate(binding.updated_at ?? binding.updatedAt);
  updated.textContent = updatedAt ? t("row.updatedAt", updatedAt) : t("row.updatedUnknown");
  detailsCell.append(note, updated);

  const actionsCell = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(
    actionButton(t("action.edit"), "edit", key),
    actionButton(t("action.test"), "test", key),
    actionButton(t("action.replace"), "replace", key),
    actionButton(t("action.delete"), "delete", key),
  );
  actionsCell.append(actions);

  row.append(externalCell, addressCell, statusCell, detailsCell, actionsCell);
  return row;
}

function actionButton(label, action, key) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row-action";
  button.dataset.action = action;
  button.dataset.bindingKey = key;
  button.textContent = label;
  return button;
}

async function handleBindingAction(action, binding, button) {
  switch (action) {
    case "edit":
      openEditDialog(binding);
      return;
    case "test":
      await testBinding(binding, button);
      return;
    case "replace":
      await replaceCredential(binding, button);
      return;
    case "delete":
      await deleteBinding(binding, button);
      return;
    default:
      return;
  }
}

function openEditDialog(binding) {
  editId.value = safeText(binding.id);
  editVersion.value = safeText(binding.version);
  editExternalId.value = safeText(binding.external_id);
  editAddress.value = safeText(binding.address);
  editAddressJwt.value = "";
  editNote.value = safeText(binding.note);
  hideNotice(editStatus);
  editDialog.showModal();
  editExternalId.focus();
}

function closeEditDialog() {
  if (editDialog.open) {
    editDialog.close();
  }
}

async function saveBinding() {
  if (!editForm.reportValidity()) {
    return;
  }
  const keyBinding = Array.from(state.bindings.values()).find(
    (binding) => safeText(binding.id) === editId.value,
  );
  if (!keyBinding) {
    showNotice(editStatus, t("edit.staleRecord"), "error");
    return;
  }

  const body = { version: parseVersion(editVersion.value) };
  const nextExternalId = editExternalId.value.trim();
  const nextAddressJwt = editAddressJwt.value.trim();
  const nextNote = editNote.value.trim();
  if (nextExternalId !== safeText(keyBinding.external_id)) {
    body.external_id = nextExternalId;
  }
  if (nextAddressJwt) {
    body.address_jwt = nextAddressJwt;
  }
  if (nextNote !== safeText(keyBinding.note)) {
    body.note = nextNote;
  }

  if (Object.keys(body).length === 1) {
    closeEditDialog();
    return;
  }

  editSaveButton.disabled = true;
  showNotice(editStatus, t("edit.saving"), "busy");
  try {
    await api(bindingPath(keyBinding), { method: "PATCH", body });
    closeEditDialog();
    showNotice(globalStatus, t("edit.saved"), "success");
    await loadBindings({ preserveNotice: true });
  } catch (error) {
    showNotice(editStatus, adminErrorMessage(error, t("edit.saveFailed")), "error");
  } finally {
    editSaveButton.disabled = false;
  }
}

async function testBinding(binding, button) {
  await withRowAction(button, t("test.testing"), async () => {
    const data = await api(`${bindingPath(binding)}/test`, {
      method: "POST",
      body: { version: parseVersion(binding.version) },
    });
    const count = numericValue(data.mail_count ?? data.message_count ?? data.messages_count);
    const detail = count === null ? "" : t("test.mailCount", count);
    showNotice(globalStatus, t("test.passed", detail), "success");
    await loadBindings({ preserveNotice: true });
  }, t("test.failed"));
}

async function replaceCredential(binding, button) {
  const jwt = window.prompt(t("replace.prompt"), "");
  if (jwt === null) {
    return;
  }
  const trimmed = jwt.trim();
  if (!trimmed) {
    showNotice(globalStatus, t("replace.cancelled"), "error");
    return;
  }

  await withRowAction(button, t("replace.verifying"), async () => {
    await api(`${bindingPath(binding)}/credential/replace`, {
      method: "POST",
      body: { version: parseVersion(binding.version), address_jwt: trimmed },
    });
    showNotice(globalStatus, t("replace.success"), "success");
    await loadBindings({ preserveNotice: true });
  }, t("replace.failed"));
}

async function deleteBinding(binding, button) {
  const externalId = safeText(binding.external_id) || t("delete.fallbackName");
  const confirmed = window.confirm(t("delete.confirm", externalId));
  if (!confirmed) {
    return;
  }

  await withRowAction(button, t("delete.deleting"), async () => {
    await api(bindingPath(binding), {
      method: "DELETE",
      body: { version: parseVersion(binding.version) },
    });
    if (state.offset > 0 && state.bindings.size === 1) {
      state.offset = Math.max(0, state.offset - pageSize);
    }
    showNotice(globalStatus, t("delete.success"), "success");
    await loadBindings({ preserveNotice: true });
  }, t("delete.failed"));
}

async function withRowAction(button, busyLabel, callback, fallbackError) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  hideNotice(globalStatus);
  try {
    await callback();
  } catch (error) {
    showNotice(globalStatus, adminErrorMessage(error, fallbackError), "error");
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

function setListBusy(busy) {
  reloadButton.disabled = busy;
  previousPage.disabled = busy || state.offset === 0;
  nextPage.disabled = busy || nextPage.disabled;
  reloadButton.textContent = busy ? t("list.loading") : t("list.reload");
}

function showAdmin(session) {
  loginView.hidden = true;
  adminView.hidden = false;
  hideNotice(loginStatus);
  const expiresAt = formatDate(session.expires_at ?? session.session?.expires_at);
  sessionExpiry.textContent = expiresAt ? t("session.expiry", expiresAt) : t("session.active");
}

function showLogin(message = "", kind = "success") {
  state.csrfToken = "";
  state.bindings.clear();
  state.search = "";
  state.offset = 0;
  state.total = null;
  bindingsBody.replaceChildren();
  createForm.reset();
  searchForm.reset();
  hideNotice(globalStatus);
  if (editDialog.open) {
    editDialog.close();
  }
  adminView.hidden = true;
  loginView.hidden = false;
  passwordInput.value = "";
  if (message) {
    showNotice(loginStatus, message, kind);
  } else {
    hideNotice(loginStatus);
  }
  window.setTimeout(() => passwordInput.focus(), 0);
}

function acceptSession(data) {
  const token = data.csrf_token ?? data.csrfToken ?? data.session?.csrf_token;
  if (typeof token === "string") {
    state.csrfToken = token;
  }
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD" && state.csrfToken) {
    headers.set("X-CSRF-Token", state.csrfToken);
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "network_error", t("error.network"), "");
  }

  const payload = await readResponse(response);
  const csrfHeader = response.headers.get("X-CSRF-Token");
  if (csrfHeader) {
    state.csrfToken = csrfHeader;
  }

  if (!response.ok || (isRecord(payload) && payload.ok === false)) {
    const error = extractApiError(response.status, payload);
    if (response.status === 401 && options.authRequired !== false) {
      showLogin(t("error.401"), "error");
    }
    throw error;
  }

  const data = isRecord(payload) && Object.hasOwn(payload, "data") ? payload.data : payload;
  return isRecord(data) || Array.isArray(data) ? data : {};
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

function extractApiError(status, payload) {
  let code = "request_failed";
  let message = "";
  let requestId = "";
  if (isRecord(payload)) {
    if (typeof payload.message === "string") {
      message = payload.message;
    }
    if (typeof payload.error === "string") {
      message = payload.error;
    } else if (isRecord(payload.error)) {
      code = safeText(payload.error.code) || code;
      message = safeText(payload.error.message) || message;
      requestId = safeText(payload.error.request_id);
    }
    requestId ||= safeText(payload.request_id);
  }
  return new ApiError(status, code, message, requestId);
}

function adminErrorMessage(error, fallback) {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  let message;
  if (error.status === 0) {
    message = t("error.network");
  } else if (error.status === 401) {
    message = t("error.401");
  } else if (error.status === 403) {
    message = t("error.403");
  } else if (error.status === 409) {
    message = t("error.409");
  } else if (error.status === 429) {
    message = t("error.429");
  } else if (error.status >= 500) {
    message = t("error.5xx");
  } else {
    message = error.message || fallback;
  }

  return error.requestId ? `${message}${t("error.requestId", error.requestId)}` : message;
}

function extractBindings(data) {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }
  if (!isRecord(data)) {
    return [];
  }
  const candidate = data.items ?? data.bindings ?? data.results;
  return Array.isArray(candidate) ? candidate.filter(isRecord) : [];
}

function extractTotal(data) {
  if (!isRecord(data)) {
    return null;
  }
  const value = data.total ?? data.total_count ?? data.pagination?.total;
  const number = numericValue(value);
  return number !== null && number >= 0 ? number : null;
}

function credentialStatus(value) {
  const status = safeText(value).toLowerCase();
  const known = [
    "active", "valid", "ready", "ok", "pending", "missing",
    "stale", "invalid", "failed", "error",
  ];
  const kinds = {
    active: "good", valid: "good", ready: "good", ok: "good",
    pending: "warning", missing: "warning", stale: "warning",
    invalid: "bad", failed: "bad", error: "bad",
  };
  if (known.includes(status)) {
    return { label: t(`status.${status}`), kind: kinds[status] };
  }
  return { label: status || t("status.unknown"), kind: "neutral" };
}

function bindingPath(binding) {
  return `/admin/api/bindings/${encodeURIComponent(safeText(binding.id))}`;
}

function parseVersion(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const date = new Date(value);
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

function showNotice(element, message, kind) {
  element.textContent = message;
  element.dataset.kind = kind;
  element.hidden = false;
}

function hideNotice(element) {
  element.textContent = "";
  delete element.dataset.kind;
  element.hidden = true;
}

class ApiError extends Error {
  constructor(status, code, message, requestId) {
    super(message || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}
