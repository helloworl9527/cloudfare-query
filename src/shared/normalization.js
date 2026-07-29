import { domainToASCII } from 'node:url';
import { ValidationError } from './errors.js';

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const UNSUPPORTED_LOCAL_CHARACTERS = /[()<>{}\[\]:;,"\\]/u;

function parseEmail(value, label) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label}必须是字符串`);
  }

  const display = value.trim().normalize('NFC');
  if (display.length < 3 || display.length > 254 || CONTROL_CHARACTERS.test(display)) {
    throw new ValidationError(`${label}长度或字符无效`);
  }

  const at = display.lastIndexOf('@');
  if (at <= 0 || at !== display.indexOf('@') || at === display.length - 1) {
    throw new ValidationError(`${label}必须是完整邮箱地址`);
  }

  const local = display.slice(0, at);
  const domainInput = display.slice(at + 1);
  if (/\s/u.test(local) || UNSUPPORTED_LOCAL_CHARACTERS.test(local)
      || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    throw new ValidationError(`${label}本地部分无效`);
  }

  const domain = domainToASCII(domainInput).toLowerCase();
  if (!domain || domain.length > 253 || domain.endsWith('.') || !domain.includes('.')) {
    throw new ValidationError(`${label}域名无效`);
  }
  const labels = domain.split('.');
  if (labels.some((part) => !DOMAIN_LABEL.test(part))) {
    throw new ValidationError(`${label}域名无效`);
  }

  return {
    display,
    normalized: `${local.toLowerCase()}@${domain}`,
  };
}

export function normalizeExternalId(value) {
  return parseEmail(value, '外部标识');
}

export function normalizeAddress(value) {
  return parseEmail(value, '临时邮箱').normalized;
}

export function normalizeAddressId(value) {
  let asString;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new ValidationError('上游地址 ID 无效');
    asString = String(value);
  } else if (typeof value === 'string') {
    asString = value.trim();
  } else {
    throw new ValidationError('上游地址 ID 无效');
  }

  if (!/^[1-9][0-9]*$/u.test(asString)) throw new ValidationError('上游地址 ID 无效');
  let parsed;
  try {
    parsed = BigInt(asString);
  } catch {
    throw new ValidationError('上游地址 ID 无效');
  }
  if (parsed <= 0n || parsed > 9223372036854775807n) {
    throw new ValidationError('上游地址 ID 无效');
  }
  return parsed.toString();
}

export function normalizeNote(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError('备注必须是字符串');
  const note = value.normalize('NFC').replace(/\r\n?/gu, '\n');
  if (note.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(note)) {
    throw new ValidationError('备注最长为 500 个字符且不能包含控制字符');
  }
  return note;
}

export function parsePositiveInteger(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label}无效`);
  }
  return parsed;
}
