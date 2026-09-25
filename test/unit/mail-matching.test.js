import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMailSubject, extractVerificationCode, selectVerificationLink,
} from "../../src/public/mail-matching.js";

test("known verification subjects are classified after Unicode normalization", () => {
  for (const subject of [
    "Verification code. Expires in 15 mins",
    "验证码将于 15 分钟后失效",
    "Este código vence en 15 minutos",
    "Código de verificación. Caduca en 15 min",
    "‫הקוד תקף ל‑15 דקות.",
  ]) assert.equal(classifyMailSubject(subject), "verification_code", subject);
  for (const subject of [
    "您的 Netflix 临时访问代码",
    "重要提示：如何更新 Netflix 同户设备",
    "Your Netflix temporary access code",
    "Important: How to update your Netflix Household",
    "您的 Netflix 暫時存取碼",
    "重要資訊：如何更新 Netflix 同戶裝置",
    "Tu código de acceso temporal de Netflix",
    "Importante: Cómo actualizar tu Hogar con Netflix",
  ]) assert.equal(classifyMailSubject(subject), "verification_link", subject);
  assert.equal(classifyMailSubject("unrelated message"), "generic");
});

test("verification code extraction returns only the code digits", () => {
  assert.equal(extractVerificationCode({ body_text: "Your code is 482913 and expires in 15 minutes." }), "482913");
  assert.equal(extractVerificationCode({ body_text: "2026-09-25. Code: 482913" }), "482913");
  assert.equal(extractVerificationCode({ body_text: "No verification number here" }), null);
});

test("Netflix CTA selection follows the subject-specific real button labels", () => {
  const cases = [
    ["您的 Netflix 临时访问代码", "获取代码"],
    ["Your Netflix temporary access code", "Get Code"],
    ["您的 Netflix 暫時存取碼", "取得存取碼"],
    ["Tu código de acceso temporal de Netflix", "Obtener código"],
    ["重要提示：如何更新 Netflix 同户设备", "是的，是我本人"],
    ["Important: How to update your Netflix Household", "Yes, This Was Me"],
    ["重要資訊：如何更新 Netflix 同戶裝置", "是，這是我本人"],
    ["Importante: Cómo actualizar tu Hogar con Netflix", "Sí, la envié yo"],
  ];
  for (const [subject, label] of cases) {
    const links = [
      { href: "https://example.com/password", text: "更改密码" },
      { href: "https://example.com/action", text: label },
      { href: "https://example.com/help", text: "Help Center" },
    ];
    assert.equal(selectVerificationLink(subject, links)?.href, "https://example.com/action", subject);
    assert.equal(selectVerificationLink(subject, [{ href: "javascript:alert(1)", text: label }]), null);
  }
});
