import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AdminStateRepository,
  BindingsRepository,
  closeDatabases,
  openAdminState,
  openBindingsAdmin,
  openBindingsReadonly,
} from '../../src/shared/database.js';
import { ConflictError } from '../../src/shared/errors.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'nfq-db-'));
  return {
    directory,
    bindings: join(directory, 'shared', 'bindings.db'),
    state: join(directory, 'admin', 'admin-state.db'),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function insert(repository, overrides = {}) {
  return repository.insert({
    externalIdDisplay: overrides.externalIdDisplay ?? 'User@example.com',
    externalIdNorm: overrides.externalIdNorm ?? 'user@example.com',
    address: overrides.address ?? 'temp@example.net',
    encryptedJwt: overrides.encryptedJwt ?? Buffer.from('encrypted'),
    note: overrides.note ?? '',
  });
}

test('bindings migrations, uniqueness, optimistic locking and readonly mode work together', () => {
  const paths = fixture();
  const admin = openBindingsAdmin(paths.bindings);
  const repository = new BindingsRepository(admin);
  const created = insert(repository);
  assert.equal(created.version, 1);
  assert.equal(repository.getByExternalNorm('user@example.com').address, 'temp@example.net');
  assert.throws(() => insert(repository, { address: 'other@example.net' }), /已绑定/u);
  assert.throws(() => insert(repository, {
    externalIdDisplay: 'Other@example.com', externalIdNorm: 'other@example.com',
  }), /已绑定/u);

  const updated = repository.update({
    id: created.id,
    expectedVersion: 1,
    externalIdDisplay: 'User@example.com',
    externalIdNorm: 'user@example.com',
    address: 'temp@example.net',
    note: 'updated',
  });
  assert.equal(updated.version, 2);
  assert.throws(() => repository.update({
    id: created.id, expectedVersion: 1,
    externalIdDisplay: 'User@example.com', externalIdNorm: 'user@example.com',
    address: 'temp@example.net', note: 'stale',
  }), ConflictError);

  const readonly = openBindingsReadonly(paths.bindings);
  assert.equal(readonly.pragma('query_only', { simple: true }), 1);
  assert.equal(new BindingsRepository(readonly).getByExternalNorm('user@example.com').note, 'updated');
  assert.throws(() => readonly.prepare("UPDATE bindings SET note = 'forbidden'").run(), /readonly|read-only/u);
  closeDatabases(readonly, admin);
  paths.cleanup();
});

test('admin state uses isolated permissions and supports revocable expiring sessions/login failures', () => {
  const paths = fixture();
  const db = openAdminState(paths.state);
  const state = new AdminStateRepository(db);
  assert.equal(statSync(paths.directory + '/admin').mode & 0o777, 0o700);
  assert.equal(statSync(paths.state).mode & 0o777, 0o600);
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');

  const ipHash = Buffer.alloc(32, 1);
  state.recordFailure(ipHash, '2026-07-10T00:00:00.000Z');
  assert.equal(state.countFailures(ipHash, '2026-07-09T00:00:00.000Z'), 1);
  state.clearFailures(ipHash);
  assert.equal(state.countFailures(ipHash, '2026-07-09T00:00:00.000Z'), 0);

  const tokenHash = Buffer.alloc(32, 2);
  state.createSession({
    tokenHash,
    csrfHash: Buffer.alloc(32, 3),
    createdAt: '2026-07-10T00:00:00.000Z',
    expiresAt: '2026-07-10T08:00:00.000Z',
  });
  assert.ok(state.getSession(tokenHash, '2026-07-10T07:59:59.000Z'));
  state.revokeSession(tokenHash);
  assert.equal(state.getSession(tokenHash, '2026-07-10T01:00:00.000Z'), null);
  closeDatabases(db);
  paths.cleanup();
});
