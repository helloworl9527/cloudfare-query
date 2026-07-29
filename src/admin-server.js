import { serve } from '@hono/node-server';
import { AdminBindingsService } from './admin/bindings-service.js';
import { createAdminApp } from './admin/app.js';
import { SessionManager } from './admin/session.js';
import { loadAdminConfig } from './shared/config.js';
import {
  AdminStateRepository,
  BindingsRepository,
  closeDatabases,
  openAdminState,
  openBindingsAdmin,
} from './shared/database.js';
import { requireNode24 } from './shared/http.js';
import { JsonLogger } from './shared/logger.js';
import { Metrics } from './shared/metrics.js';
import { UpstreamClient } from './shared/upstream.js';

requireNode24();
const config = loadAdminConfig();
const logger = new JsonLogger({ service: 'nf-query-admin' });
const metrics = new Metrics('nfq_admin');
const bindingsDb = openBindingsAdmin(config.bindingsDbPath);
const stateDb = openAdminState(config.adminStateDbPath);
const repository = new BindingsRepository(bindingsDb);
const stateRepository = new AdminStateRepository(stateDb);
const upstream = new UpstreamClient({
  baseUrl: config.upstreamBaseUrl,
  customPassword: config.customPassword,
  timeoutMs: config.upstreamTimeoutMs,
  maxResponseBytes: config.upstreamMaxBytes,
  onRequest: ({ route, status, durationMs, bytes }) => {
    metrics.increment('upstream_requests', { route, status });
    metrics.observe('upstream_duration_seconds', durationMs / 1000, { route });
    logger.info('upstream_request', { route, status, duration_ms: durationMs, response_bytes: bytes });
  },
});
const bindingService = new AdminBindingsService({
  repository, upstream, encryptionKey: config.encryptionKey, logger,
});
const sessionManager = new SessionManager({
  stateRepository,
  passwordHash: config.adminPasswordHash,
  sessionTtlMs: config.sessionTtlMs,
  loginWindowMs: config.loginWindowMs,
  loginMaxFailures: config.loginMaxFailures,
});
const app = createAdminApp({
  bindingService, sessionManager, origins: config.origins, trustProxy: config.trustProxy,
  proxySecret: config.proxySecret, metrics, logger,
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
    closeDatabases(stateDb, bindingsDb);
    process.exitCode = 0;
  });
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
