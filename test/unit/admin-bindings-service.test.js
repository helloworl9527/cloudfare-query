import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AdminBindingsService } from '../../src/admin/bindings-service.js';
import { decryptAddressJwt } from '../../src/shared/crypto.js';
import {
  BindingsRepository,
  closeDatabases,
  openBindingsAdmin,
} from '../../src/shared/database.js';

function jwtFor(address, id) {
  return `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ address, address_id: String(id) })).toString('base64url')}.signature`;
}

test('binding create/update/test/replace/delete preserve optimistic versions and never delete upstream', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nfq-binding-service-'));
  const db = openBindingsAdmin(join(directory, 'bindings.db'));
  const repository = new BindingsRepository(db);
  const key = Buffer.alloc(32, 6);
  const calls = [];
  const upstream = {
    async getSettings(jwt, address) {
      calls.push(['settings', address, jwt]);
      return { address };
    },
    async getMails(jwt, address) {
      calls.push(['mails', address, jwt]);
      return { results: [{ raw: 'mail' }], count: 1 };
    },
  };
  const service = new AdminBindingsService({
    repository, upstream, encryptionKey: key, logger: { error() {} },
  });

  const created = await service.create({
    external_id: 'User@example.com', address_jwt: jwtFor('temp@example.net', 7), note: 'first',
  }, { requestId: 'create' });
  assert.equal(created.version, 1);
  assert.equal(created.address, 'temp@example.net');
  assert.equal(calls.filter(([name]) => name === 'settings').length, 1);

  const noteUpdated = await service.update(created.id, {
    version: created.version, note: 'second\nline',
  }, { requestId: 'update-note' });
  assert.equal(noteUpdated.version, 2);
  assert.equal(noteUpdated.note, 'second\nline');
  assert.equal(calls.filter(([name]) => name === 'settings').length, 1);

  await assert.rejects(service.update(created.id, {
    version: noteUpdated.version,
  }, { requestId: 'update-empty' }));

  const addressUpdated = await service.update(created.id, {
    version: noteUpdated.version, address_jwt: jwtFor('other@example.net', 8),
  }, { requestId: 'update-address' });
  assert.equal(addressUpdated.version, 3);
  assert.equal(addressUpdated.address, 'other@example.net');
  const storedAfterAddressUpdate = repository.getById(created.id);
  assert.equal(
    decryptAddressJwt(storedAfterAddressUpdate.address_jwt_enc, 'other@example.net', key),
    jwtFor('other@example.net', 8),
  );

  const tested = await service.testCredential(created.id, { version: addressUpdated.version }, { requestId: 'test' });
  assert.equal(tested.mail_count, 1);
  assert.equal(tested.binding.version, 4);

  await assert.rejects(service.replaceCredential(created.id, {
    version: tested.binding.version, address_jwt: jwtFor('mismatched@example.net', 9),
  }, { requestId: 'replace-wrong-address' }));

  const replaced = await service.replaceCredential(created.id, {
    version: tested.binding.version, address_jwt: jwtFor('other@example.net', 8),
  }, { requestId: 'replace' });
  assert.equal(replaced.version, 5);

  const deleted = service.delete(created.id, { version: replaced.version }, { requestId: 'delete' });
  assert.equal(deleted.id, created.id);
  assert.equal(repository.getById(created.id), null);
  assert.equal(calls.some(([name]) => name === 'delete'), false);

  closeDatabases(db);
  rmSync(directory, { recursive: true, force: true });
});
