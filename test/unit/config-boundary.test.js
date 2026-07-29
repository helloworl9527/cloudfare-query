import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadAdminConfig, loadPublicConfig } from '../../src/shared/config.js';
import { hashAdminPassword } from '../../src/shared/crypto.js';

test('public configuration starts with only its own credential and never loads admin secrets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nfq-public-creds-'));
  writeFileSync(join(directory, 'address-jwt-key'), Buffer.alloc(32, 5), { mode: 0o600 });
  const names = [
    'CREDENTIALS_DIRECTORY', 'ADDRESS_JWT_KEY_FILE', 'MAIL_CUSTOM_PASSWORD_FILE',
    'ADMIN_PASSWORD_HASH_FILE', 'NFQ_PROXY_SECRET_FILE',
    'NFQ_UPSTREAM_BASE_URL', 'NFQ_ORIGIN', 'NODE_ENV',
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.CREDENTIALS_DIRECTORY = directory;
    process.env.NODE_ENV = 'test';
    process.env.NFQ_UPSTREAM_BASE_URL = 'https://upstream.example';
    const config = loadPublicConfig();
    assert.equal(config.encryptionKey.length, 32);
    assert.equal(config.customPassword, null);
    assert.equal(Object.hasOwn(config, 'adminPasswordHash'), false);
    assert.equal(Object.hasOwn(config, 'proxySecret'), false);
    assert.throws(() => loadAdminConfig(), /credential/u);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('admin configuration rejects malformed password hashes and non-isolated database paths at startup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nfq-admin-creds-'));
  const credentials = join(directory, 'credentials');
  const shared = join(directory, 'shared');
  const admin = join(directory, 'admin');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(credentials, { recursive: true });
  mkdirSync(shared, { recursive: true });
  mkdirSync(admin, { recursive: true });
  writeFileSync(join(credentials, 'address-jwt-key'), Buffer.alloc(32, 2));
  writeFileSync(join(credentials, 'admin-password-hash'), 'malformed');
  const names = [
    'CREDENTIALS_DIRECTORY', 'NFQ_BINDINGS_DB', 'NFQ_ADMIN_STATE_DB',
    'NFQ_TRUST_PROXY', 'NFQ_UPSTREAM_BASE_URL', 'NODE_ENV',
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.CREDENTIALS_DIRECTORY = credentials;
    process.env.NFQ_BINDINGS_DB = join(shared, 'bindings.db');
    process.env.NFQ_ADMIN_STATE_DB = join(admin, 'admin-state.db');
    process.env.NFQ_UPSTREAM_BASE_URL = 'https://upstream.example';
    assert.throws(() => loadAdminConfig(), /哈希格式/u);
    writeFileSync(join(credentials, 'admin-password-hash'), await hashAdminPassword('a sufficiently long password'));
    process.env.NFQ_ADMIN_STATE_DB = join(shared, 'admin-state.db');
    assert.throws(() => loadAdminConfig(), /不同隔离目录/u);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
