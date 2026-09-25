const BIDI_MARKS = /[\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069]/gu;

function normalizeSubject(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(BIDI_MARKS, "").replace(/\s+/gu, " ").trim().toLocaleLowerCase()
    : "";
}

const CODE_SUBJECTS = new Set([
  "verification code. expires in 15 mins",
  "验证码将于 15 分钟后失效",
  "este código vence en 15 minutos",
  "código de verificación. caduca en 15 min",
  "הקוד תקף ל‑15 דקות.",
].map(normalizeSubject));

const LINK_SUBJECTS = new Set([
  "您的 netflix 临时访问代码",
  "重要提示：如何更新 netflix 同户设备",
  "your netflix temporary access code",
  "important: how to update your netflix household",
  "您的 netflix 暫時存取碼",
  "重要資訊：如何更新 netflix 同戶裝置",
  "tu código de acceso temporal de netflix",
  "importante: cómo actualizar tu hogar con netflix",
].map(normalizeSubject));

export function classifyMailSubject(subject) {
  const normalized = normalizeSubject(subject);
  if (CODE_SUBJECTS.has(normalized)) return "verification_code";
  if (LINK_SUBJECTS.has(normalized)) return "verification_link";
  return "generic";
}

export function extractVerificationCode(mail) {
  // Prefer the MIME parser's visible text. HTML attributes may contain
  // unrelated six-digit IDs, so only inspect markup when text is unavailable.
  const plain = typeof mail?.body_text === "string" ? mail.body_text : "";
  const html = typeof mail?.body_html === "string" ? mail.body_html : "";
  const text = plain.trim() ? plain : html.replace(/<[^>]*>/gu, " ");
  return text.match(/(?<!\d)\d{6}(?!\d)/u)?.[0] ?? null;
}

const BUTTON_LABELS = new Map([
  ['您的 netflix 临时访问代码', '获取代码'],
  ['your netflix temporary access code', 'get code'],
  ['您的 netflix 暫時存取碼', '取得存取碼'],
  ['tu código de acceso temporal de netflix', 'obtener código'],
  ['重要提示：如何更新 netflix 同户设备', '是的，是我本人'],
  ['important: how to update your netflix household', 'yes, this was me'],
  ['重要資訊：如何更新 netflix 同戶裝置', '是，這是我本人'],
  ['importante: cómo actualizar tu hogar con netflix', 'sí, la envié yo'],
].map(([subject, label]) => [normalizeSubject(subject), normalizeSubject(label)]));

export function selectVerificationLink(subject, links) {
  const expectedLabel = BUTTON_LABELS.get(normalizeSubject(subject));
  if (!expectedLabel) return null;
  return links.find(({ href, text }) => {
    if (typeof href !== 'string' || !/^https:\/\//iu.test(href)) return false;
    return normalizeSubject(text) === expectedLabel;
  }) ?? null;
}

export function extractVerificationLink(mail) {
  const html = typeof mail?.body_html === "string" ? mail.body_html : "";
  if (html && typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    const links = [...document.querySelectorAll("a[href]")]
      .map((link) => ({ href: link.getAttribute("href") ?? "", text: link.textContent ?? "", html: buttonHtml(link) }));
    return selectVerificationLink(mail.subject, links);
  }
  return null;
}

function buttonHtml(link) {
  // Netflix puts CTA background and padding on a surrounding table cell.
  // Keep the smallest table containing only this action when possible.
  let table = link.closest('table');
  while (table) {
    const links = table.querySelectorAll('a[href]');
    if (links.length === 1 && links[0] === link
        && table.textContent.trim().replace(/\s+/gu, ' ').length < 100) {
      return table.outerHTML;
    }
    table = table.parentElement?.closest('table') ?? null;
  }
  return link.outerHTML;
}
