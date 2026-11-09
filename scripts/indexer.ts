import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Settings } from '../apps/indexer/config.ts';
import { settings } from '../apps/indexer/config.ts';
import { connection, validateScope } from '../apps/indexer/read-model.ts';
import { chainReader } from '../apps/indexer/rpc.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function startupContext(config: Settings) {
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
  let startupFloor = eligible > 0n ? eligible : 0n;
  if (previous > eligible) startupFloor = previous;

  const environment = {
    ...process.env,
    DEPLOYMENT_FILE: resolve(process.env.DEPLOYMENT_FILE!),
    INDEXER_SCHEMA: config.schema,
    INDEXER_PORT: String(config.port),
    API_PORT: String(config.apiPort),
    CONFIRMATION_DELAY: String(config.confirmationDelay),
    REORG_WINDOW_SECONDS: String(config.reorgWindow),
    INDEXER_STARTUP_MIN_BLOCK: startupFloor.toString(),
  };
  return { startupFloor, environment };
}

function isRunning(child: ChildProcess) {
  return child.exitCode === null && child.signalCode === null;
}

function applicationSupervisor() {
  const children: ChildProcess[] = [];
  let shuttingDown = false;
  let deadline: NodeJS.Timeout | undefined;

  function shutdown(code: number) {
    if (shuttingDown) return;
    shuttingDown = true;
    process.exitCode = code;
    for (const child of children) {
      if (isRunning(child)) child.kill('SIGTERM');
    }
    deadline = setTimeout(() => {
      for (const child of children) {
        if (isRunning(child)) child.kill('SIGKILL');
      }
    }, 8_000);
    deadline.unref();
  }

  function watch(child: ChildProcess) {
    children.push(child);
    child.once('error', () => {
      console.error('APPLICATION_CHILD_START_FAILED');
      shutdown(1);
    });
    child.once('exit', () => {
      if (!shuttingDown) shutdown(1);
      if (children.every((entry) => !isRunning(entry)) && deadline) clearTimeout(deadline);
    });
    return child;
  }
  return { watch, shutdown };
}

function spawnIndexer(config: Settings, environment: NodeJS.ProcessEnv) {
  const bin = fileURLToPath(import.meta.resolve('ponder'));
  const packageRoot = resolve(dirname(bin), '../..');
  return spawn(
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
      env: environment,
      stdio: 'inherit',
    },
  );
}

function spawnReadApi(environment: NodeJS.ProcessEnv) {
  return spawn(process.execPath, [resolve(root, 'scripts/read-api.ts')], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
}

async function startApplication() {
  const config = settings();
  const { environment, startupFloor } = await startupContext(config);
  const supervisor = applicationSupervisor();
  const indexer = supervisor.watch(spawnIndexer(config, environment));
  const api = supervisor.watch(spawnReadApi(environment));

  console.log(
    JSON.stringify({
      event: 'APPLICATION_CHILDREN',
      indexerPid: indexer.pid,
      apiPid: api.pid,
      startupFloor: startupFloor.toString(),
    }),
  );
  process.once('SIGTERM', () => supervisor.shutdown(0));
  process.once('SIGINT', () => supervisor.shutdown(0));
}

try {
  await startApplication();
} catch (error) {
  console.error(
    'INDEXER_START_REFUSED',
    error instanceof Error ? error.message : 'configuration unavailable',
  );
  process.exitCode = 1;
}
