"use strict";

export const EMAIL_HISTORY_STORAGE_KEY = "nfq_successful_external_ids";
export const EMAIL_HISTORY_LIMIT = 10;

export function loadEmailHistory(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(EMAIL_HISTORY_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return sanitizeHistory(parsed);
  } catch {
    return [];
  }
}

export function rememberSuccessfulEmail(storage, email, currentHistory = loadEmailHistory(storage)) {
  const normalizedEmail = sanitizeEmail(email);
  if (!normalizedEmail) return sanitizeHistory(currentHistory);

  const history = [
    normalizedEmail,
    ...sanitizeHistory(currentHistory).filter(
      (item) => emailKey(item) !== emailKey(normalizedEmail),
    ),
  ].slice(0, EMAIL_HISTORY_LIMIT);

  persistHistory(storage, history);
  return history;
}

export function removeSuccessfulEmail(storage, email, currentHistory = loadEmailHistory(storage)) {
  const target = sanitizeEmail(email);
  const history = sanitizeHistory(currentHistory);
  if (!target) return history;

  const remaining = history.filter((item) => emailKey(item) !== emailKey(target));
  persistHistory(storage, remaining);
  return remaining;
}

export function clearEmailHistory(storage) {
  persistHistory(storage, []);
  return [];
}

function persistHistory(storage, history) {
  try {
    storage.setItem(EMAIL_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Browsers can deny or exhaust local storage. History management should
    // still work in memory for the lifetime of this page.
  }
}

function sanitizeHistory(values) {
  const history = [];
  const seen = new Set();
  for (const value of values) {
    const email = sanitizeEmail(value);
    if (!email) continue;
    const key = emailKey(email);
    if (seen.has(key)) continue;
    seen.add(key);
    history.push(email);
    if (history.length === EMAIL_HISTORY_LIMIT) break;
  }
  return history;
}

function emailKey(email) {
  return email.toLocaleLowerCase("en-US");
}

function sanitizeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim();
  if (
    email.length === 0
    || email.length > 254
    || /[\s<>,]/u.test(email)
    || !/^[^@]+@[^@]+\.[^@]+$/u.test(email)
  ) {
    return "";
  }
  return email;
}
