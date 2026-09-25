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
  const matches = text.match(/(?<!\d)\d{4,8}(?!\d)/gu) ?? [];
  return matches.find((value) => value.length === 6)
    ?? matches.find((value) => value.length !== 4 || !/^20\d{2}$/u.test(value))
    ?? null;
}

export function extractVerificationLink(mail) {
  const html = typeof mail?.body_html === "string" ? mail.body_html : "";
  if (html && typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    const links = [...document.querySelectorAll("a[href]")]
      .map((link) => ({ href: link.getAttribute("href") ?? "", text: link.textContent ?? "", html: link.outerHTML }))
      .filter(({ href }) => /^https?:\/\//iu.test(href));
    const preferred = links.find(({ text }) =>
      /(verify|confirm|access|continue|household|验证|访问|確認|存取|actualizar|hogar|code|código|代码|碼)/iu.test(text));
    return preferred ?? (links.length === 1 ? links[0] : null);
  }
  return null;
}
