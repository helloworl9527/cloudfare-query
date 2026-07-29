import Database from 'better-sqlite3';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConflictError, NotFoundError, isSqliteConstraint } from './errors.js';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function utcNow() {
  return new Date().toISOString();
}

function ensureParent(path, mode = 0o750) {
  mkdirSync(dirname(path), { recursive: true, mode });
}

function migrationFiles(kind) {
  const directory = join(PROJECT_ROOT, 'migrations', kind);
  return readdirSync(directory)
    .filter((name) => /^\d+_.+\.sql$/u.test(name))
    .sort()
    .map((name) => ({
      version: Number(name.slice(0, name.indexOf('_'))),
      name,
      sql: readFileSync(join(directory, name), 'utf8'),
    }));
}

function migrate(db, kind) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version);
  const appliedSet = new Set(applied);
  const run = db.transaction((migration) => {
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
      .run(migration.version, migration.name, utcNow());
  });
  for (const migration of migrationFiles(kind)) {
    if (!appliedSet.has(migration.version)) run(migration);
  }
}

export function openBindingsAdmin(path) {
  ensureParent(path, 0o750);
  const db = new Database(path);
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = DELETE');
  db.pragma('synchronous = FULL');
  db.pragma('secure_delete = ON');
  migrate(db, 'bindings');
  return db;
}

export function openBindingsReadonly(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 100');
  db.pragma('query_only = ON');
  return db;
}

function hardenAdminStateFiles(path) {
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${path}${suffix}`;
    if (existsSync(candidate)) chmodSync(candidate, 0o600);
  }
}

export function openAdminState(path) {
  ensureParent(path, 0o700);
  chmodSync(dirname(path), 0o700);
  const db = new Database(path);
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('secure_delete = ON');
  migrate(db, 'admin-state');
  hardenAdminStateFiles(path);
  return db;
}

function apiBinding(row) {
  if (!row) return null;
  return {
    id: row.id,
    external_id: row.external_id_display,
    address: row.address,
    credential_status: row.credential_status,
    credential_updated_at: row.credential_updated_at,
    last_verified_at: row.last_verified_at,
    note: row.note,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class BindingsRepository {
  constructor(db) {
    this.db = db;
    this.getByExternalStatement = db.prepare(`
      SELECT * FROM bindings WHERE external_id_type = 'email' AND external_id_norm = ?
    `);
    this.getByIdStatement = db.prepare('SELECT * FROM bindings WHERE id = ?');
    this.getByAddressStatement = db.prepare('SELECT * FROM bindings WHERE address = ? COLLATE NOCASE');
  }

  getByExternalNorm(externalIdNorm) {
    return this.getByExternalStatement.get(externalIdNorm) ?? null;
  }

  getById(id) {
    return this.getByIdStatement.get(id) ?? null;
  }

  getByAddress(address) {
    return this.getByAddressStatement.get(address) ?? null;
  }

  requireById(id) {
    const row = this.getById(id);
    if (!row) throw new NotFoundError('绑定不存在');
    return row;
  }

  list({ search = '', limit = 50, offset = 0 }) {
    const escaped = search.replace(/[\\%_]/gu, (match) => `\\${match}`);
    const pattern = `%${escaped}%`;
    const where = search
      ? `WHERE external_id_display LIKE ? ESCAPE '\\' COLLATE NOCASE
          OR address LIKE ? ESCAPE '\\' COLLATE NOCASE
          OR note LIKE ? ESCAPE '\\' COLLATE NOCASE`
      : '';
    const args = search ? [pattern, pattern, pattern] : [];
    const total = this.db.prepare(`SELECT COUNT(*) AS count FROM bindings ${where}`).get(...args).count;
    const rows = this.db.prepare(`
      SELECT * FROM bindings ${where}
      ORDER BY id DESC LIMIT ? OFFSET ?
    `).all(...args, limit, offset);
    return { items: rows.map(apiBinding), total };
  }

  insert({ externalIdDisplay, externalIdNorm, address, encryptedJwt, note }) {
    const now = utcNow();
    try {
      const result = this.db.prepare(`
        INSERT INTO bindings (
          external_id_type, external_id_display, external_id_norm, address,
          address_jwt_enc, credential_status, credential_updated_at,
          last_verified_at, note, version, created_at, updated_at
        ) VALUES ('email', ?, ?, ?, ?, 'valid', ?, ?, ?, 1, ?, ?)
      `).run(externalIdDisplay, externalIdNorm, address, encryptedJwt, now, now, note, now, now);
      return apiBinding(this.getById(Number(result.lastInsertRowid)));
    } catch (error) {
      if (isSqliteConstraint(error)) {
        throw new ConflictError('外部标识或临时邮箱已绑定', 'duplicate_binding');
      }
      throw error;
    }
  }

  update({ id, expectedVersion, externalIdDisplay, externalIdNorm, address, encryptedJwt, note }) {
    const current = this.requireById(id);
    const nextEncryptedJwt = encryptedJwt ?? current.address_jwt_enc;
    const credentialStatus = encryptedJwt ? 'valid' : current.credential_status;
    const credentialUpdatedAt = encryptedJwt ? utcNow() : current.credential_updated_at;
    const lastVerifiedAt = encryptedJwt ? credentialUpdatedAt : current.last_verified_at;
    const now = utcNow();
    try {
      const result = this.db.prepare(`
        UPDATE bindings SET
          external_id_display = ?, external_id_norm = ?, address = ?,
          address_jwt_enc = ?, credential_status = ?, credential_updated_at = ?,
          last_verified_at = ?, note = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(
        externalIdDisplay, externalIdNorm, address, nextEncryptedJwt,
        credentialStatus, credentialUpdatedAt, lastVerifiedAt, note,
        now, id, expectedVersion,
      );
      if (result.changes !== 1) throw new ConflictError();
      return apiBinding(this.getById(id));
    } catch (error) {
      if (isSqliteConstraint(error)) {
        throw new ConflictError('外部标识或临时邮箱已绑定', 'duplicate_binding');
      }
      throw error;
    }
  }

  replaceCredential({ id, expectedVersion, encryptedJwt }) {
    const now = utcNow();
    const result = this.db.prepare(`
      UPDATE bindings SET address_jwt_enc = ?, credential_status = 'valid',
        credential_updated_at = ?, last_verified_at = ?,
        version = version + 1, updated_at = ?
      WHERE id = ? AND version = ?
    `).run(encryptedJwt, now, now, now, id, expectedVersion);
    if (result.changes !== 1) throw new ConflictError();
    return apiBinding(this.getById(id));
  }

  setCredentialStatus({ id, expectedVersion, status, verified = false }) {
    const now = utcNow();
    const result = this.db.prepare(`
      UPDATE bindings SET credential_status = ?, last_verified_at = ?,
        version = version + 1, updated_at = ?
      WHERE id = ? AND version = ?
    `).run(status, verified ? now : null, now, id, expectedVersion);
    if (result.changes !== 1) throw new ConflictError();
    return apiBinding(this.getById(id));
  }

  delete({ id, expectedVersion }) {
    const current = this.requireById(id);
    const result = this.db.prepare('DELETE FROM bindings WHERE id = ? AND version = ?').run(id, expectedVersion);
    if (result.changes !== 1) throw new ConflictError();
    return apiBinding(current);
  }

  audit({ action, bindingId = null, result, requestId }) {
    const inserted = this.db.prepare(`
      INSERT INTO admin_audit (action, binding_id, result, request_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(action, bindingId, result, requestId, utcNow());
    const newestId = Number(inserted.lastInsertRowid);
    if (newestId % 100 === 0) {
      this.db.prepare('DELETE FROM admin_audit WHERE id < ?').run(Math.max(1, newestId - 10_000));
    }
  }
}

export class AdminStateRepository {
  constructor(db) {
    this.db = db;
  }

  cleanup(now = utcNow()) {
    this.db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now);
  }

  countFailures(ipHash, cutoff) {
    return this.db.prepare(`
      SELECT COUNT(*) AS count FROM login_failures
      WHERE ip_hash = ? AND occurred_at >= ?
    `).get(ipHash, cutoff).count;
  }

  recordFailure(ipHash, now = utcNow()) {
    this.db.prepare('INSERT INTO login_failures (ip_hash, occurred_at) VALUES (?, ?)').run(ipHash, now);
  }

  clearFailures(ipHash) {
    this.db.prepare('DELETE FROM login_failures WHERE ip_hash = ?').run(ipHash);
  }

  pruneFailures(cutoff) {
    this.db.prepare('DELETE FROM login_failures WHERE occurred_at < ?').run(cutoff);
  }

  createSession({ tokenHash, csrfHash, createdAt, expiresAt }) {
    this.db.prepare(`
      INSERT INTO admin_sessions (token_hash, csrf_hash, created_at, expires_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(tokenHash, csrfHash, createdAt, expiresAt, createdAt);
  }

  getSession(tokenHash, now = utcNow()) {
    const row = this.db.prepare(`
      SELECT * FROM admin_sessions WHERE token_hash = ? AND expires_at > ?
    `).get(tokenHash, now);
    if (!row) return null;
    this.db.prepare('UPDATE admin_sessions SET last_activity_at = ? WHERE token_hash = ?').run(now, tokenHash);
    return row;
  }

  rotateCsrf(tokenHash, csrfHash) {
    const result = this.db.prepare('UPDATE admin_sessions SET csrf_hash = ? WHERE token_hash = ?')
      .run(csrfHash, tokenHash);
    return result.changes === 1;
  }

  revokeSession(tokenHash) {
    this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
  }
}

export function closeDatabases(...databases) {
  for (const db of databases) {
    if (db?.open) db.close();
  }
}
