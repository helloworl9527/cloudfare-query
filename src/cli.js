import { join, resolve } from 'node:path';
import { hashAdminPassword } from './shared/crypto.js';
import { requireNode24 } from './shared/http.js';

async function stdinText(maxBytes = 2048) {
  if (process.stdin.isTTY) {
    throw new Error('请通过标准输入传入密码，避免密码出现在命令行参数或 shell 历史中');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('标准输入过长');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/u, '');
}

async function migrateOnly() {
  const { closeDatabases, openAdminState, openBindingsAdmin } = await import('./shared/database.js');
  const dataDir = resolve(process.env.NFQ_DATA_DIR ?? '/var/lib/nf-query');
  const bindingsPath = resolve(process.env.NFQ_BINDINGS_DB ?? join(dataDir, 'shared', 'bindings.db'));
  const statePath = resolve(process.env.NFQ_ADMIN_STATE_DB ?? join(dataDir, 'admin', 'admin-state.db'));
  const bindingsDb = openBindingsAdmin(bindingsPath);
  const stateDb = openAdminState(statePath);
  closeDatabases(stateDb, bindingsDb);
  process.stdout.write('migrations applied\n');
}

async function main() {
  requireNode24();
  const command = process.argv[2];
  if (command === 'hash-password') {
    process.stdout.write(`${await hashAdminPassword(await stdinText())}\n`);
    return;
  }
  if (command === 'migrate') {
    await migrateOnly();
    return;
  }
  throw new Error('用法: node src/cli.js <migrate|hash-password>');
}

main().catch((error) => {
  process.stderr.write(`nf-query CLI failed: ${error.message}\n`);
  process.exitCode = 1;
});
