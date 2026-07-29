import { isIP } from 'node:net';
import {
  AuthenticationError,
  ForbiddenError,
  AppError,
} from '../shared/errors.js';
import {
  constantTimeBufferEqual,
  randomToken,
  sha256,
  verifyAdminPassword,
} from '../shared/crypto.js';
import { WorkQueue } from '../shared/queue.js';

export const ADMIN_COOKIE_NAME = 'nfq_admin_session';

function cookieValue(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function sessionCookie(token, expiresAt, ttlMs) {
  const maxAge = Math.floor(ttlMs / 1000);
  return `${ADMIN_COOKIE_NAME}=${token}; Path=/admin; Max-Age=${maxAge}; Expires=${new Date(expiresAt).toUTCString()}; Secure; HttpOnly; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${ADMIN_COOKIE_NAME}=; Path=/admin; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Strict`;
}

export function requireExactOrigin(c, allowedOrigins) {
  const origin = c.req.header('origin');
  if (!origin || !allowedOrigins.has(origin)) {
    throw new ForbiddenError('请求来源校验失败', 'invalid_origin');
  }
}

export function trustedClientIp(c, trustProxy) {
  if (trustProxy) {
    const value = c.req.header('x-real-ip')?.trim();
    if (value && value.length <= 64 && isIP(value)) return value;
    return 'missing-trusted-ip';
  }
  return 'loopback';
}

export function requireTrustedProxy(c, trustProxy, proxySecret) {
  if (!trustProxy) return;
  const supplied = c.req.header('x-nfq-proxy-auth') ?? '';
  if (!supplied || supplied.length > 512 || !constantTimeBufferEqual(sha256(supplied), sha256(proxySecret))) {
    throw new ForbiddenError('反向代理校验失败', 'invalid_proxy');
  }
}

export class SessionManager {
  constructor({ stateRepository, passwordHash, sessionTtlMs, loginWindowMs, loginMaxFailures }) {
    this.state = stateRepository;
    this.passwordHash = passwordHash;
    this.sessionTtlMs = sessionTtlMs;
    this.loginWindowMs = loginWindowMs;
    this.loginMaxFailures = loginMaxFailures;
    // Login is intentionally serialized. This makes the persisted check +
    // scrypt + failure insert atomic for every IP and bounds distributed CPU.
    this.loginQueue = new WorkQueue({ concurrency: 1, maxQueue: 32, maxWaitMs: 10_000 });
  }

  async login(password, ip) {
    return this.loginQueue.run(() => this.#loginSerialized(password, ip), { totalTimeoutMs: 15_000 });
  }

  async #loginSerialized(password, ip) {
    const now = Date.now();
    const ipHash = sha256(ip);
    const cutoff = new Date(now - this.loginWindowMs).toISOString();
    this.state.pruneFailures(cutoff);
    if (this.state.countFailures(ipHash, cutoff) >= this.loginMaxFailures) {
      throw new AppError('登录失败次数过多，请稍后再试', { code: 'login_locked', status: 429 });
    }

    const valid = await verifyAdminPassword(password, this.passwordHash);
    if (!valid) {
      this.state.recordFailure(ipHash, new Date(now).toISOString());
      if (this.state.countFailures(ipHash, cutoff) >= this.loginMaxFailures) {
        throw new AppError('登录失败次数过多，请稍后再试', { code: 'login_locked', status: 429 });
      }
      throw new AuthenticationError('管理员密码错误');
    }

    this.state.clearFailures(ipHash);
    this.state.cleanup(new Date(now).toISOString());
    const token = randomToken();
    const csrfToken = randomToken();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + this.sessionTtlMs).toISOString();
    this.state.createSession({
      tokenHash: sha256(token),
      csrfHash: sha256(csrfToken),
      createdAt,
      expiresAt,
    });
    return {
      token,
      csrfToken,
      expiresAt,
      cookie: sessionCookie(token, expiresAt, this.sessionTtlMs),
    };
  }

  authenticate(c) {
    const token = cookieValue(c.req.header('cookie'), ADMIN_COOKIE_NAME);
    if (!token || token.length > 128 || !/^[A-Za-z0-9_-]+$/u.test(token)) {
      throw new AuthenticationError();
    }
    const tokenHash = sha256(token);
    const row = this.state.getSession(tokenHash);
    if (!row) throw new AuthenticationError('管理员会话已过期');
    return { ...row, tokenHash };
  }

  validateCsrf(c, session) {
    const token = c.req.header('x-csrf-token');
    if (!token || token.length > 128 || !constantTimeBufferEqual(sha256(token), session.csrf_hash)) {
      throw new ForbiddenError('CSRF 校验失败', 'invalid_csrf');
    }
  }

  rotateCsrf(session) {
    const csrfToken = randomToken();
    if (!this.state.rotateCsrf(session.tokenHash, sha256(csrfToken))) {
      throw new AuthenticationError('管理员会话已过期');
    }
    return csrfToken;
  }

  revoke(session) {
    this.state.revokeSession(session.tokenHash);
  }
}
