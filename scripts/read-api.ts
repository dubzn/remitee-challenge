import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { settings } from '../apps/indexer/config.ts';
import { connection } from '../apps/indexer/read-model.ts';
import { apiServer } from '../apps/indexer/api/server.ts';

try {
  if (!/^(0|[1-9][0-9]*)$/.test(process.env.INDEXER_STARTUP_MIN_BLOCK ?? ''))
    throw new Error('Shared launcher startup floor is required');
  const config = settings();
  const pool = connection(config);
  pool.on('error', () => console.error('READ_API_DATABASE_CONNECTION_LOST'));
  const server = apiServer(config, pool, fileURLToPath(new URL('../.docs/api/openapi.yaml', import.meta.url)));
  const close = () => {
    server.close(() => { void pool.end(); });
    server.closeIdleConnections();
    const deadline = setTimeout(() => process.exit(1), 5_000);
    deadline.unref();
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
  server.listen(config.apiPort, '127.0.0.1');
  await once(server, 'listening');
  console.log(`READ_API_LISTENING ${config.apiPort}`);
} catch (error) {
  console.error('READ_API_START_REFUSED', error instanceof Error ? error.message : 'configuration unavailable');
  process.exitCode = 1;
}
