import assert from 'node:assert/strict';
import { database, rpc } from './services.ts';

type Block = { number: string; timestamp: string; hash: string };
const head = () => rpc<Block>('eth_getBlockByNumber', ['latest', false]);

assert.equal(await rpc('eth_chainId'), '0x7a69');
const initial = await head();
const timestamp = Number(BigInt(initial.timestamp)) + 60;
await rpc('evm_setNextBlockTimestamp', [timestamp]);
await rpc('evm_mine');
const mined = await head();
assert.equal(BigInt(mined.timestamp), BigInt(timestamp));
assert.equal(BigInt(mined.number), BigInt(initial.number) + 1n);
await rpc('anvil_mine', ['0x3']);
assert.equal(BigInt((await head()).number), BigInt(mined.number) + 3n);
console.log('PASS exact timestamp and chosen block count');

const snapshot = await rpc<string>('evm_snapshot');
const beforeFork = await head();
const forkTime = Number(BigInt(beforeFork.timestamp)) + 10;
await rpc('evm_setNextBlockTimestamp', [forkTime]);
await rpc('evm_mine');
const branchA = await head();
assert.equal(await rpc('evm_revert', [snapshot]), true);
assert.equal((await head()).hash, beforeFork.hash);
await rpc('evm_setNextBlockTimestamp', [forkTime + 1]);
await rpc('evm_mine');
const branchB = await head();
assert.equal(branchA.number, branchB.number);
assert.notEqual(branchA.hash, branchB.hash);
console.log('PASS snapshot/revert: different hashes at the same height');

const client = database();
const contender = database();
try {
  await client.connect();
  await contender.connect();
  await client.query('CREATE TEMP TABLE foundation_probe (id integer PRIMARY KEY)');
  await client.query('BEGIN');
  await client.query('INSERT INTO foundation_probe VALUES (1)');
  await client.query('ROLLBACK');
  assert.equal((await client.query('SELECT count(*)::int AS count FROM foundation_probe')).rows[0].count, 0);
  console.log('PASS real PostgreSQL transaction rollback');

  // Two clients in the same database contend for one session advisory key.
  assert.equal((await client.query('SELECT pg_try_advisory_lock(31337) AS locked')).rows[0].locked, true);
  assert.equal((await contender.query('SELECT pg_try_advisory_lock(31337) AS locked')).rows[0].locked, false);
  await client.query('SELECT pg_advisory_unlock(31337)');
  assert.equal((await contender.query('SELECT pg_try_advisory_lock(31337) AS locked')).rows[0].locked, true);
  await contender.query('SELECT pg_advisory_unlock(31337)');
  console.log('PASS advisory lock contention and release');
} finally {
  await Promise.allSettled([client.end(), contender.end()]);
}
console.log('PASS foundation smoke checks (no escrow behavior tested)');
