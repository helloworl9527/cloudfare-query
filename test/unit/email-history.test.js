import assert from "node:assert/strict";
import test from "node:test";
import {
  clearEmailHistory,
  EMAIL_HISTORY_LIMIT,
  EMAIL_HISTORY_STORAGE_KEY,
  loadEmailHistory,
  rememberSuccessfulEmail,
  removeSuccessfulEmail,
} from "../../src/public/email-history.js";

function memoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) {
    values.set(EMAIL_HISTORY_STORAGE_KEY, initialValue);
  }
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("successful email history is newest-first and case-insensitively deduplicated", () => {
  const storage = memoryStorage();
  rememberSuccessfulEmail(storage, "first@example.com");
  rememberSuccessfulEmail(storage, "second@example.com");
  const history = rememberSuccessfulEmail(storage, " FIRST@EXAMPLE.COM ");

  assert.deepEqual(history, ["FIRST@EXAMPLE.COM", "second@example.com"]);
  assert.deepEqual(loadEmailHistory(storage), history);
});

test("email history tolerates corrupt storage and keeps only bounded email values", () => {
  assert.deepEqual(loadEmailHistory(memoryStorage("{broken")), []);

  const values = [
    "one@example.com",
    "ONE@example.com",
    "not-an-email",
    null,
    ...Array.from({ length: EMAIL_HISTORY_LIMIT + 5 }, (_, index) => `user${index}@example.com`),
  ];
  const history = loadEmailHistory(memoryStorage(JSON.stringify(values)));

  assert.equal(history.length, EMAIL_HISTORY_LIMIT);
  assert.deepEqual(history.slice(0, 2), ["one@example.com", "user0@example.com"]);
});

test("storage write failures do not break a successful query flow", () => {
  const storage = {
    getItem() {
      return JSON.stringify(["old@example.com"]);
    },
    setItem() {
      throw new Error("quota exceeded");
    },
  };

  assert.deepEqual(
    rememberSuccessfulEmail(storage, "new@example.com"),
    ["new@example.com", "old@example.com"],
  );
});

test("one email can be removed without changing the remaining order", () => {
  const storage = memoryStorage(JSON.stringify([
    "first@example.com",
    "second@example.com",
    "third@example.com",
  ]));

  const history = removeSuccessfulEmail(storage, "SECOND@EXAMPLE.COM");

  assert.deepEqual(history, ["first@example.com", "third@example.com"]);
  assert.deepEqual(loadEmailHistory(storage), history);
});

test("all email history can be cleared in one operation", () => {
  const storage = memoryStorage(JSON.stringify(["first@example.com", "second@example.com"]));

  assert.deepEqual(clearEmailHistory(storage), []);
  assert.deepEqual(loadEmailHistory(storage), []);
});
