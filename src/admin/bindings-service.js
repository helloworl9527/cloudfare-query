import { encryptAddressJwt, decryptAddressJwt, parseAddressJwtClaims } from '../shared/crypto.js';
import { ConflictError, UpstreamError, ValidationError } from '../shared/errors.js';
import {
  normalizeExternalId,
  normalizeNote,
  parsePositiveInteger,
} from '../shared/normalization.js';

export class AdminBindingsService {
  constructor({ repository, upstream, encryptionKey, logger }) {
    this.repository = repository;
    this.upstream = upstream;
    this.encryptionKey = encryptionKey;
    this.logger = logger;
  }

  list(input) {
    return this.repository.list(input);
  }

  // The admin pastes the address JWT directly (no stored upstream admin
  // password): the bound temporary mailbox address is never typed separately,
  // it is read from the JWT's own claims, then confirmed live against
  // upstream via /api/settings. This bounds a compromised admin process to
  // already-issued JWTs instead of the upstream administrator credential, at
  // the cost of no automated batch re-fetch if the upstream JWT secret is
  // ever rotated.
  async #decodeAndVerifyJwt(rawJwt, { signal } = {}) {
    const jwt = typeof rawJwt === 'string' ? rawJwt : '';
    const claims = parseAddressJwtClaims(jwt);
    await this.upstream.getSettings(jwt, claims.address, { signal });
    return { address: claims.address, jwt };
  }

  async create(body, { requestId, signal } = {}) {
    const external = normalizeExternalId(body.external_id);
    const note = normalizeNote(body.note ?? '') ?? '';
    try {
      const { address, jwt } = await this.#decodeAndVerifyJwt(body.address_jwt, { signal });
      if (this.repository.getByExternalNorm(external.normalized) || this.repository.getByAddress(address)) {
        throw new ConflictError('外部标识或临时邮箱已绑定', 'duplicate_binding');
      }
      const encryptedJwt = encryptAddressJwt(jwt, address, this.encryptionKey);
      const binding = this.repository.insert({
        externalIdDisplay: external.display,
        externalIdNorm: external.normalized,
        address,
        encryptedJwt,
        note,
      });
      this.#audit('binding.create', binding.id, 'success', requestId);
      return binding;
    } catch (error) {
      this.#audit('binding.create', null, error.code ?? 'error', requestId);
      throw error;
    }
  }

  async update(id, body, { requestId, signal } = {}) {
    const bindingId = parsePositiveInteger(id, '绑定 ID');
    const expectedVersion = parsePositiveInteger(body.version, '版本');
    const current = this.repository.requireById(bindingId);
    if (current.version !== expectedVersion) throw new ConflictError();
    if (!['external_id', 'note', 'address_jwt'].some((key) => Object.hasOwn(body, key))) {
      throw new ValidationError('没有可更新的字段');
    }
    const external = normalizeExternalId(body.external_id ?? current.external_id_display);
    const note = normalizeNote(body.note ?? current.note) ?? '';
    let address = current.address;
    let encryptedJwt;
    try {
      if (Object.hasOwn(body, 'address_jwt')) {
        const decoded = await this.#decodeAndVerifyJwt(body.address_jwt, { signal });
        address = decoded.address;
        encryptedJwt = encryptAddressJwt(decoded.jwt, address, this.encryptionKey);
      }
      const updated = this.repository.update({
        id: bindingId,
        expectedVersion,
        externalIdDisplay: external.display,
        externalIdNorm: external.normalized,
        address,
        encryptedJwt,
        note,
      });
      this.#audit('binding.update', bindingId, 'success', requestId);
      return updated;
    } catch (error) {
      this.#audit('binding.update', bindingId, error.code ?? 'error', requestId);
      throw error;
    }
  }

  delete(id, body, { requestId } = {}) {
    const bindingId = parsePositiveInteger(id, '绑定 ID');
    const expectedVersion = parsePositiveInteger(body.version, '版本');
    try {
      const deleted = this.repository.delete({ id: bindingId, expectedVersion });
      this.#audit('binding.delete_local', bindingId, 'success', requestId);
      return deleted;
    } catch (error) {
      this.#audit('binding.delete_local', bindingId, error.code ?? 'error', requestId);
      throw error;
    }
  }

  async replaceCredential(id, body, { requestId, signal } = {}) {
    const bindingId = parsePositiveInteger(id, '绑定 ID');
    const expectedVersion = parsePositiveInteger(body.version, '版本');
    const current = this.repository.requireById(bindingId);
    if (current.version !== expectedVersion) throw new ConflictError();
    try {
      const { address, jwt } = await this.#decodeAndVerifyJwt(body.address_jwt, { signal });
      if (address !== current.address) {
        throw new ValidationError('新 JWT 对应的临时邮箱与当前绑定不一致，如需更换邮箱请使用编辑功能');
      }
      const encryptedJwt = encryptAddressJwt(jwt, current.address, this.encryptionKey);
      const updated = this.repository.replaceCredential({ id: bindingId, expectedVersion, encryptedJwt });
      this.#audit('credential.replace', bindingId, 'success', requestId);
      return updated;
    } catch (error) {
      this.#audit('credential.replace', bindingId, error.code ?? 'error', requestId);
      throw error;
    }
  }

  async testCredential(id, body, { requestId, signal } = {}) {
    const bindingId = parsePositiveInteger(id, '绑定 ID');
    const expectedVersion = parsePositiveInteger(body.version, '版本');
    const current = this.repository.requireById(bindingId);
    if (current.version !== expectedVersion) throw new ConflictError();
    const jwt = decryptAddressJwt(current.address_jwt_enc, current.address, this.encryptionKey);
    try {
      const result = await this.upstream.getMails(jwt, current.address, { signal });
      const updated = this.repository.setCredentialStatus({
        id: bindingId, expectedVersion, status: 'valid', verified: true,
      });
      this.#audit('credential.test', bindingId, 'success', requestId);
      return { binding: updated, mail_count: result.results.length };
    } catch (error) {
      const status = error instanceof UpstreamError && error.upstreamStatus === 400
        ? 'invalid'
        : 'unknown';
      try {
        this.repository.setCredentialStatus({
          id: bindingId, expectedVersion, status, verified: false,
        });
      } catch (updateError) {
        this.logger?.error('credential_status_update_failed', updateError, { binding_id: bindingId });
      }
      this.#audit('credential.test', bindingId, error.code ?? 'error', requestId);
      throw error;
    }
  }

  #audit(action, bindingId, result, requestId = 'cli') {
    try {
      this.repository.audit({ action, bindingId, result, requestId });
    } catch (error) {
      this.logger?.error('audit_write_failed', error, { action, binding_id: bindingId });
    }
  }
}
