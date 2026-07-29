import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AppError } from './errors.js';
import { parseEncryptionKey, validateAdminPasswordHash } from './crypto.js';

function integer(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new AppError(`${name} 配置无效`, { code: 'invalid_configuration' });
  }
  return value;
}

function url(name, fallback, { allowHttpInTest = false } = {}) {
  let parsed;
  try { parsed = new URL(process.env[name] ?? fallback); } catch {
    throw new AppError(`${name} 配置无效`, { code: 'invalid_configuration' });
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new AppError(`${name} 必须是无路径、查询和凭据的源站 URL`, { code: 'invalid_configuration' });
  }
  if (parsed.protocol !== 'https:' && !(allowHttpInTest && parsed.protocol === 'http:')) {
    throw new AppError(`${name} 必须使用 HTTPS`, { code: 'invalid_configuration' });
  }
  return parsed.origin;
}

// Multiple hostnames can front the same app (e.g. a primary domain plus a
// branded alias); each still needs the same strict single-origin URL shape,
// so this validates every comma/whitespace-separated entry with the same
// rules as url() and returns the set of allowed Origin header values.
function urlList(name, fallback, { allowHttpInTest = false } = {}) {
  const parts = (process.env[name] ?? fallback).split(/[,\s]+/u).filter(Boolean);
  if (parts.length === 0) {
    throw new AppError(`${name} 配置无效`, { code: 'invalid_configuration' });
  }
  const origins = new Set();
  for (const part of parts) {
    let parsed;
    try { parsed = new URL(part); } catch {
      throw new AppError(`${name} 配置无效`, { code: 'invalid_configuration' });
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new AppError(`${name} 必须是无路径、查询和凭据的源站 URL`, { code: 'invalid_configuration' });
    }
    if (parsed.protocol !== 'https:' && !(allowHttpInTest && parsed.protocol === 'http:')) {
      throw new AppError(`${name} 必须使用 HTTPS`, { code: 'invalid_configuration' });
    }
    origins.add(parsed.origin);
  }
  return origins;
}

function credentialPath(explicitName, credentialName) {
  if (process.env[explicitName]) return resolve(process.env[explicitName]);
  if (process.env.CREDENTIALS_DIRECTORY) return join(process.env.CREDENTIALS_DIRECTORY, credentialName);
  return null;
}

function readRequiredCredential(explicitName, credentialName) {
  const path = credentialPath(explicitName, credentialName);
  if (!path || !existsSync(path)) {
    throw new AppError(`缺少 systemd credential: ${credentialName}`, { code: 'invalid_configuration' });
  }
  return readFileSync(path);
}

function readOptionalCredential(explicitName, credentialName) {
  const explicit = process.env[explicitName];
  const path = credentialPath(explicitName, credentialName);
  if (!path || !existsSync(path)) {
    if (explicit) throw new AppError(`找不到 credential 文件: ${credentialName}`, { code: 'invalid_configuration' });
    return null;
  }
  return readFileSync(path);
}

function headerCredential(buffer, credentialName) {
  const value = buffer.toString('utf8');
  if (!value || Buffer.byteLength(value, 'utf8') > 4096 || /[\u0000\r\n]/u.test(value)) {
    throw new AppError(`${credentialName} 不是有效的单行 HTTP 凭据`, { code: 'invalid_configuration' });
  }
  return value;
}

function commonConfig() {
  const dataDir = resolve(process.env.NFQ_DATA_DIR ?? '/var/lib/nf-query');
  const customPasswordBuffer = readOptionalCredential('MAIL_CUSTOM_PASSWORD_FILE', 'mail-custom-password');
  return {
    bindHost: '127.0.0.1',
    bindingsDbPath: resolve(process.env.NFQ_BINDINGS_DB ?? join(dataDir, 'shared', 'bindings.db')),
    origins: urlList('NFQ_ORIGIN', 'https://nf.mystool.me'),
    upstreamBaseUrl: url('NFQ_UPSTREAM_BASE_URL', 'https://temp-email-api.mystool.me', {
      allowHttpInTest: process.env.NODE_ENV === 'test',
    }),
    customPassword: customPasswordBuffer ? headerCredential(customPasswordBuffer, 'mail-custom-password') : null,
    encryptionKey: parseEncryptionKey(readRequiredCredential('ADDRESS_JWT_KEY_FILE', 'address-jwt-key')),
    upstreamTimeoutMs: integer('NFQ_UPSTREAM_TIMEOUT_MS', 8000, 1000, 8000),
    upstreamMaxBytes: integer('NFQ_UPSTREAM_MAX_BYTES', 16 * 1024 * 1024, 1024, 16 * 1024 * 1024),
  };
}

export function loadPublicConfig() {
  return {
    ...commonConfig(),
    port: integer('NFQ_PUBLIC_PORT', 3789, 1, 65535),
    workflowConcurrency: integer('NFQ_WORKFLOW_CONCURRENCY', 4, 1, 4),
    workflowQueueSize: integer('NFQ_WORKFLOW_QUEUE_SIZE', 64, 0, 64),
    workflowQueueWaitMs: integer('NFQ_WORKFLOW_QUEUE_WAIT_MS', 15000, 100, 15000),
    queryTotalTimeoutMs: integer('NFQ_QUERY_TOTAL_TIMEOUT_MS', 25000, 1000, 25000),
    mimeConcurrency: integer('NFQ_MIME_CONCURRENCY', 2, 1, 2),
    rawMaxBytes: integer('NFQ_RAW_MAX_BYTES', 2 * 1024 * 1024, 1024, 2 * 1024 * 1024),
    bodyMaxBytes: integer('NFQ_BODY_MAX_BYTES', 100 * 1024, 1024, 100 * 1024),
    htmlMaxBytes: integer('NFQ_BODY_HTML_MAX_BYTES', 200 * 1024, 1024, 512 * 1024),
  };
}

export function loadAdminConfig() {
  const dataDir = resolve(process.env.NFQ_DATA_DIR ?? '/var/lib/nf-query');
  const trustProxy = process.env.NFQ_TRUST_PROXY === '1';
  const proxySecret = trustProxy
    ? readRequiredCredential('NFQ_PROXY_SECRET_FILE', 'proxy-auth-secret').toString('utf8').trim()
    : null;
  if (trustProxy && Buffer.byteLength(proxySecret, 'utf8') < 32) {
    throw new AppError('proxy-auth-secret 至少需要 32 字节', { code: 'invalid_configuration' });
  }
  const bindingsDbPath = resolve(process.env.NFQ_BINDINGS_DB ?? join(dataDir, 'shared', 'bindings.db'));
  const adminStateDbPath = resolve(process.env.NFQ_ADMIN_STATE_DB ?? join(dataDir, 'admin', 'admin-state.db'));
  if (bindingsDbPath === adminStateDbPath || dirname(bindingsDbPath) === dirname(adminStateDbPath)) {
    throw new AppError('bindings.db 与 admin-state.db 必须位于不同隔离目录', { code: 'invalid_configuration' });
  }
  const adminPasswordHash = readRequiredCredential(
    'ADMIN_PASSWORD_HASH_FILE', 'admin-password-hash',
  ).toString('utf8').trim();
  validateAdminPasswordHash(adminPasswordHash);
  return {
    ...commonConfig(),
    port: integer('NFQ_ADMIN_PORT', 3790, 1, 65535),
    bindingsDbPath,
    adminStateDbPath,
    adminPasswordHash,
    trustProxy,
    proxySecret,
    sessionTtlMs: integer('NFQ_SESSION_TTL_MS', 8 * 60 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000),
    loginWindowMs: integer('NFQ_LOGIN_WINDOW_MS', 10 * 60 * 1000, 60_000, 60 * 60 * 1000),
    loginMaxFailures: integer('NFQ_LOGIN_MAX_FAILURES', 5, 1, 20),
  };
}
