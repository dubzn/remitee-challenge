import assert from 'node:assert/strict';
import { database, rpc } from './services.ts';

try {
  assert.equal(await rpc('eth_chainId'), '0x7a69');
  console.log('RPC_READY chainId=31337');
} catch (error) {
  console.error('RPC_UNAVAILABLE', error instanceof Error ? error.message : 'unknown failure');
  process.exit(1);
}

const client = database();
try {
  await client.connect();
  assert.equal((await client.query('SELECT 1 AS ok')).rows[0].ok, 1);
  console.log('DB_READY');
} catch (error) {
  console.error('DB_UNAVAILABLE', error instanceof Error ? error.message : 'unknown failure');
  process.exitCode = 1;
} finally {
  await client.end();
}
