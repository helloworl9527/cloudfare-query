import { decryptAddressJwt } from '../shared/crypto.js';
import { NotFoundError, OverloadedError } from '../shared/errors.js';
import { normalizeExternalId } from '../shared/normalization.js';

export class QueryService {
  constructor({ repository, upstream, mailParser, encryptionKey, queue, metrics, logger }) {
    this.repository = repository;
    this.upstream = upstream;
    this.mailParser = mailParser;
    this.encryptionKey = encryptionKey;
    this.queue = queue;
    this.metrics = metrics;
    this.logger = logger;
  }

  async query(externalId, { totalTimeoutMs, signal } = {}) {
    const external = normalizeExternalId(externalId);
    let binding;
    try {
      binding = this.repository.getByExternalNorm(external.normalized);
    } catch (error) {
      if (error?.code === 'SQLITE_BUSY' || error?.code === 'SQLITE_LOCKED') {
        throw new OverloadedError('绑定数据库暂时繁忙');
      }
      throw error;
    }
    if (!binding) throw new NotFoundError('未找到对应绑定');
    const jwt = decryptAddressJwt(binding.address_jwt_enc, binding.address, this.encryptionKey);

    return this.queue.run(async ({ signal, queueMs }) => {
      const response = await this.upstream.getMails(jwt, binding.address, { signal });
      const messages = await this.mailParser.parseMany(response.results, { signal });
      if (Number.isFinite(response.count) && response.count >= 0) {
        this.metrics?.increment('upstream_d1_rows_read_estimated', {}, response.count + 10);
        this.metrics?.increment('upstream_d1_rows_written_estimated', {}, 1);
      }
      this.logger?.info('query_processed', {
        binding_id: binding.id,
        queue_ms: queueMs,
        message_count: messages.length,
      });
      return { messages, refreshed_at: new Date().toISOString() };
    }, { totalTimeoutMs, signal });
  }
}
