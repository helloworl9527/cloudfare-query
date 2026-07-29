import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { AppError, ValidationError } from './errors.js';
import { normalizeAddress, normalizeAddressId } from './normalization.js';

const scrypt = promisify(scryptCallback);
const ENCRYPTION_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_LENGTH = 64;

export function sha256(value) {
  return createHash('sha256').update(value).digest();
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function parseEncryptionKey(value) {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(value ?? '');
  const text = raw.toString('utf8').trim();
  const candidates = [];

  if (/^[0-9a-f]{64}$/iu.test(text)) candidates.push(Buffer.from(text, 'hex'));
  if (/^[A-Za-z0-9_-]{43,44}$/u.test(text)) {
    try { candidates.push(Buffer.from(text, 'base64url')); } catch { /* ignored */ }
  }
  if (/^[A-Za-z0-9+/]{43}={0,2}$/u.test(text)) {
    try { candidates.push(Buffer.from(text, 'base64')); } catch { /* ignored */ }
  }
  if (raw.length === 32) candidates.push(raw);
  if (Buffer.byteLength(text, 'utf8') === 32) candidates.push(Buffer.from(text, 'utf8'));

  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) throw new AppError('地址 JWT 加密密钥必须正好为 32 字节', { code: 'invalid_configuration' });
  return Buffer.from(key);
}

function aadFor(address) {
  return Buffer.from(`nf-query:address-jwt:v1\0${normalizeAddress(address)}`, 'utf8');
}

export function encryptAddressJwt(jwt, address, key) {
  if (typeof jwt !== 'string' || jwt.length < 16 || jwt.length > 16384) {
    throw new ValidationError('上游返回的地址 JWT 无效');
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aadFor(address));
  const ciphertext = Buffer.concat([cipher.update(jwt, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([ENCRYPTION_VERSION]), nonce, tag, ciphertext]);
}

export function decryptAddressJwt(blob, address, key) {
  const value = Buffer.from(blob ?? []);
  if (value.length < 1 + NONCE_BYTES + TAG_BYTES + 1 || value[0] !== ENCRYPTION_VERSION) {
    throw new AppError('地址凭据密文格式无效', { code: 'credential_decryption_failed' });
  }
  try {
    const nonce = value.subarray(1, 1 + NONCE_BYTES);
    const tag = value.subarray(1 + NONCE_BYTES, 1 + NONCE_BYTES + TAG_BYTES);
    const ciphertext = value.subarray(1 + NONCE_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aadFor(address));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (cause) {
    throw new AppError('地址凭据无法解密', { code: 'credential_decryption_failed', cause });
  }
}

function decodeJwtPart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch (cause) {
    throw new ValidationError('上游返回的地址 JWT 格式无效', { cause });
  }
}

export function parseAddressJwtClaims(jwt) {
  if (typeof jwt !== 'string' || jwt.length < 16 || Buffer.byteLength(jwt, 'utf8') > 16384) {
    throw new ValidationError('地址 JWT 无效');
  }
  const parts = jwt.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new ValidationError('地址 JWT 格式无效');
  }
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (header?.alg !== 'HS256' || typeof payload !== 'object' || payload === null) {
    throw new ValidationError('地址 JWT 声明无效');
  }
  const address = normalizeAddress(payload.address);
  const addressId = normalizeAddressId(payload.address_id);
  return { header, payload, address, addressId };
}

export function validateAddressJwt(jwt, expectedAddress, expectedAddressId) {
  const claims = parseAddressJwtClaims(jwt);
  if (claims.address !== normalizeAddress(expectedAddress)
      || claims.addressId !== normalizeAddressId(expectedAddressId)) {
    throw new ValidationError('地址 JWT 与所选地址不一致');
  }
  return claims;
}

export async function hashAdminPassword(password, { salt = randomBytes(16) } = {}) {
  validatePasswordShape(password);
  const hash = await scrypt(password, salt, SCRYPT_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$v=1$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString('base64url')}$${Buffer.from(hash).toString('base64url')}`;
}

export async function verifyAdminPassword(password, encoded) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024) return false;
  const { N, r, p, salt, expected } = parseAdminPasswordHash(encoded);
  const actual = Buffer.from(await scrypt(password, salt, expected.length, {
    N, r, p, maxmem: 64 * 1024 * 1024,
  }));
  return timingSafeEqual(actual, expected);
}

function parseAdminPasswordHash(encoded) {
  const match = /^scrypt\$v=1\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/u.exec(encoded ?? '');
  if (!match) throw new AppError('管理员密码哈希格式无效', { code: 'invalid_configuration' });
  const [, nText, rText, pText, saltText, expectedText] = match;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(expectedText, 'base64url');
  if (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P || salt.length < 16 || expected.length !== SCRYPT_LENGTH) {
    throw new AppError('管理员密码哈希参数无效', { code: 'invalid_configuration' });
  }
  return { N, r, p, salt, expected };
}

export function validateAdminPasswordHash(encoded) {
  parseAdminPasswordHash(encoded);
  return encoded;
}

function validatePasswordShape(password) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 1024) {
    throw new ValidationError('管理员密码必须为 12 至 1024 字节');
  }
}

export function constantTimeBufferEqual(left, right) {
  const a = Buffer.from(left ?? []);
  const b = Buffer.from(right ?? []);
  return a.length === b.length && timingSafeEqual(a, b);
}
