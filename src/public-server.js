import { serve } from '@hono/node-server';
import { loadPublicConfig } from './shared/config.js';
import { openBindingsReadonly, BindingsRepository, closeDatabases } from './shared/database.js';
import { requireNode24 } from './shared/http.js';
import { JsonLogger } from './shared/logger.js';
import { MailParser } from './shared/mail.js';
import { Metrics } from './shared/metrics.js';
import { WorkQueue } from './shared/queue.js';
import { UpstreamClient } from './shared/upstream.js';
import { QueryService } from './public/query-service.js';
import { createPublicApp } from './public-app.js';

requireNode24();
const config = loadPublicConfig();
const logger = new JsonLogger({ service: 'nf-query-public' });
const metrics = new Metrics('nfq_public');
const db = openBindingsReadonly(config.bindingsDbPath);
const repository = new BindingsRepository(db);
const queue = new WorkQueue({
  concurrency: config.workflowConcurrency,
  maxQueue: config.workflowQueueSize,
  maxWaitMs: config.workflowQueueWaitMs,
  onWait: (milliseconds) => metrics.observe('queue_wait_seconds', milliseconds / 1000),
});
const upstream = new UpstreamClient({
  baseUrl: config.upstreamBaseUrl,
  customPassword: config.customPassword,
  timeoutMs: config.upstreamTimeoutMs,
  maxResponseBytes: config.upstreamMaxBytes,
  onRequest: ({ route, status, durationMs, bytes }) => {
    metrics.increment('upstream_requests', { route, status });
    metrics.observe('upstream_duration_seconds', durationMs / 1000, { route });
    metrics.observe('upstream_response_bytes', bytes, { route });
    logger.info('upstream_request', { route, status, duration_ms: durationMs, response_bytes: bytes });
  },
});
const mailParser = new MailParser({
  concurrency: config.mimeConcurrency,
  rawMaxBytes: config.rawMaxBytes,
  bodyMaxBytes: config.bodyMaxBytes,
  htmlMaxBytes: config.htmlMaxBytes,
  onParse: ({ durationMs, status, rawBytes, truncated }) => {
    metrics.increment('mime_parses', { status });
    metrics.observe('mime_parse_duration_seconds', durationMs / 1000, { status });
    metrics.observe('mime_raw_bytes', rawBytes, { status });
    if (truncated) metrics.increment('mime_body_truncations', { status });
  },
});
const queryService = new QueryService({
  repository, upstream, mailParser, encryptionKey: config.encryptionKey, queue, metrics, logger,
});
const app = createPublicApp({
  queryService, queue, metrics, logger, queryTotalTimeoutMs: config.queryTotalTimeoutMs,
});
const server = serve({ fetch: app.fetch, hostname: config.bindHost, port: config.port }, (info) => {
  logger.info('service_started', { address: info.address, port: info.port });
});

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info('service_stopping', { signal });
  server.close(() => {
    metrics.close();
    closeDatabases(db);
    process.exitCode = 0;
  });
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
