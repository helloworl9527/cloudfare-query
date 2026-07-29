import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptAddressJwt,
  encryptAddressJwt,
  hashAdminPassword,
  parseEncryptionKey,
  validateAddressJwt,
  verifyAdminPassword,
} from '../../src/shared/crypto.js';
import {
  normalizeAddress,
  normalizeAddressId,
  normalizeExternalId,
  normalizeNote,
} from '../../src/shared/normalization.js';

function fakeJwt(payload, header = { alg: 'HS256', typ: 'JWT' }) {
  return `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test('external email normalization is case-insensitive without provider-specific rewriting', () => {
  assert.deepEqual(normalizeExternalId('  User.Name+tag@GMAIL.COM  '), {
    display: 'User.Name+tag@GMAIL.COM',
    normalized: 'user.name+tag@gmail.com',
  });
  assert.equal(normalizeExternalId('username@gmail.com').normalized, 'username@gmail.com');
  assert.notEqual(normalizeExternalId('user.name@gmail.com').normalized, 'username@gmail.com');
  assert.equal(normalizeExternalId('User@例子.公司').normalized, 'user@xn--fsqu00a.xn--55qx5d');
});

test('invalid emails and control characters are rejected', () => {
  for (const value of ['', 'not-an-email', 'a@@example.com', '.a@example.com', 'a@localhost', 'a\n@example.com', 'a<>@example.com', 'a,b@example.com']) {
    assert.throws(() => normalizeExternalId(value));
  }
  assert.equal(normalizeAddress(' Temp@Example.COM '), 'temp@example.com');
});

test('address IDs accept safe positive numeric/string forms only', () => {
  assert.equal(normalizeAddressId(42), '42');
  assert.equal(normalizeAddressId('42'), '42');
  for (const value of [0, -1, 1.5, '0', '-1', '01', '1x', '', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => normalizeAddressId(value));
  }
});

test('notes preserve line breaks but reject unsafe controls', () => {
  assert.equal(normalizeNote('line 1\r\nline 2'), 'line 1\nline 2');
  assert.throws(() => normalizeNote('bad\u0000note'));
});

test('AES-256-GCM protects JWT and binds it to the mailbox address', () => {
  const key = Buffer.alloc(32, 7);
  const jwt = fakeJwt({ address: 'temp@example.com', address_id: '7' });
  const encrypted = encryptAddressJwt(jwt, 'temp@example.com', key);
  assert.notEqual(encrypted.toString('utf8'), jwt);
  assert.equal(decryptAddressJwt(encrypted, 'TEMP@example.com', key), jwt);
  assert.throws(() => decryptAddressJwt(encrypted, 'other@example.com', key));
  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptAddressJwt(tampered, 'temp@example.com', key));
});

test('encryption keys support documented encodings', () => {
  const key = Buffer.alloc(32, 9);
  assert.deepEqual(parseEncryptionKey(key), key);
  assert.deepEqual(parseEncryptionKey(`${key.toString('hex')}\n`), key);
  assert.deepEqual(parseEncryptionKey(key.toString('base64url')), key);
  assert.throws(() => parseEncryptionKey('too short'));
});

test('JWT validation accepts numeric/string address_id and intentionally has no expiry requirement', () => {
  for (const addressId of [12, '12']) {
    const result = validateAddressJwt(fakeJwt({ address: 'Temp@Example.com', address_id: addressId }), 'temp@example.com', 12);
    assert.equal(result.address, 'temp@example.com');
    assert.equal(result.addressId, '12');
    assert.equal(Object.hasOwn(result.payload, 'exp'), false);
  }
  assert.throws(() => validateAddressJwt(fakeJwt({ address: null, address_id: '12' }), 'temp@example.com', 12));
  assert.throws(() => validateAddressJwt(fakeJwt({ address: 'other@example.com', address_id: '12' }), 'temp@example.com', 12));
  assert.throws(() => validateAddressJwt(fakeJwt({ address: 'temp@example.com', address_id: '13' }), 'temp@example.com', 12));
  assert.throws(() => validateAddressJwt(fakeJwt({ address: 'temp@example.com', address_id: '12' }, { alg: 'none' }), 'temp@example.com', 12));
});

test('administrator passwords use scrypt and verify in constant-length form', async () => {
  const encoded = await hashAdminPassword('a sufficiently long password');
  assert.match(encoded, /^scrypt\$v=1\$N=16384,r=8,p=1\$/u);
  assert.equal(await verifyAdminPassword('a sufficiently long password', encoded), true);
  assert.equal(await verifyAdminPassword('wrong password', encoded), false);
});
