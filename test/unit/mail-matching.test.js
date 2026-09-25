import assert from "node:assert/strict";
import test from "node:test";
import { classifyMailSubject, extractVerificationCode } from "../../src/public/mail-matching.js";

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
  assert.equal(extractVerificationCode({ body_text: "No verification number here" }), null);
});
