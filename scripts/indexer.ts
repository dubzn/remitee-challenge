import { spawn } from 'node:child_process';
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
      env: { ...process.env, INDEXER_STARTUP_MIN_BLOCK: startupFloor.toString() },
      stdio: 'inherit',
    },
  );
  const forward = (signal: NodeJS.Signals) => child.kill(signal);
  process.on('SIGTERM', forward);
  process.on('SIGINT', forward);
  child.on('error', () => {
    console.error('INDEXER_START_FAILED');
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
} catch (error) {
  console.error(
    'INDEXER_START_REFUSED',
    error instanceof Error ? error.message : 'configuration unavailable',
  );
  process.exitCode = 1;
}
