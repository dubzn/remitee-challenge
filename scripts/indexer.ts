import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settings } from '../apps/indexer/config.ts';
import { chainReader } from '../apps/indexer/rpc.ts';
import { connection, validateScope } from '../apps/indexer/read-model.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const config = settings();
  await chainReader(config).identity();
  const pool = connection(config);
  let previous: bigint;
  try {
    previous = await validateScope(config, pool, process.argv.includes('--replay'));
  } finally {
    await pool.end();
  }
  const head = await chainReader(config).block('latest');
  if (!head) throw new Error('rpc_unavailable');
  const eligible = BigInt(head.number) - BigInt(config.confirmationDelay);
  const startupFloor = previous > eligible ? previous : eligible > 0n ? eligible : 0n;
  const bin = fileURLToPath(import.meta.resolve('ponder'));
  const packageRoot = resolve(dirname(bin), '../..');
  const shared = {
    ...process.env,
    DEPLOYMENT_FILE: resolve(process.env.DEPLOYMENT_FILE!),
    INDEXER_SCHEMA: config.schema,
    INDEXER_PORT: String(config.port),
    API_PORT: String(config.apiPort),
    CONFIRMATION_DELAY: String(config.confirmationDelay),
    REORG_WINDOW_SECONDS: String(config.reorgWindow),
    INDEXER_STARTUP_MIN_BLOCK: startupFloor.toString(),
  };
  const children: ChildProcess[] = [];
  let shuttingDown = false;
  let deadline: NodeJS.Timeout | undefined;
  function shutdown(code: number) {
    if (shuttingDown) return;
    shuttingDown = true;
    process.exitCode = code;
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    deadline = setTimeout(() => {
      for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 8_000);
    deadline.unref();
  }
  function supervise(child: ChildProcess) {
    children.push(child);
    child.once('error', () => { console.error('APPLICATION_CHILD_START_FAILED'); shutdown(1); });
    child.once('exit', () => {
      if (!shuttingDown) shutdown(1);
      if (children.every(c => c.exitCode !== null || c.signalCode !== null) && deadline) clearTimeout(deadline);
    });
  }
  const child = spawn(
    process.execPath,
    [
      resolve(packageRoot, 'dist/esm/bin/ponder.js'),
      'start',
      '--schema',
      config.schema,
      '--hostname',
      '127.0.0.1',
      '--port',
      String(config.port),
      '--log-format',
      'json',
    ],
    {
      cwd: resolve(root, 'apps/indexer'),
      env: shared,
      stdio: 'inherit',
    },
  );
  supervise(child);
  const api = spawn(process.execPath, [resolve(root, 'scripts/read-api.ts')], { cwd: root, env: shared, stdio: 'inherit' });
  supervise(api);
  console.log(JSON.stringify({ event: 'APPLICATION_CHILDREN', indexerPid: child.pid, apiPid: api.pid, startupFloor: startupFloor.toString() }));
  process.once('SIGTERM', () => shutdown(0));
  process.once('SIGINT', () => shutdown(0));
} catch (error) {
  console.error(
    'INDEXER_START_REFUSED',
    error instanceof Error ? error.message : 'configuration unavailable',
  );
  process.exitCode = 1;
}
