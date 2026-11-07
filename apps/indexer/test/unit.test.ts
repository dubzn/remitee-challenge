import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { project } from '../projection.ts';
import type { EscrowRecord, EventRecord, Observation, ProjectionStore, Hex } from '../projection.ts';
import { deployment, settings } from '../config.ts';
import { chainReader } from '../rpc.ts';
const hash = `0x${'ab'.repeat(32)}` as Hex;
const sender = `0x${'11'.repeat(20)}` as Hex;
const beneficiary = `0x${'22'.repeat(20)}` as Hex;
const creation: Observation = {
  name: 'EscrowCreated',
  transactionHash: hash,
  logIndex: 0,
  transactionIndex: 0,
  blockNumber: 3n,
  blockHash: hash,
  escrowId: 1n,
  actor: sender,
  payload: 'creation',
  data: '0x',
  topics: [hash],
  created: {
    id: 1n,
    sender,
    beneficiary,
    token: sender,
    amount: (1n << 256n) - 1n,
    createdAt: 1n,
    cancelDeadline: 7201n,
    expiresAt: 604801n,
  },
};
function store() {
  const journal = new Map<string, EventRecord>();
  const escrows = new Map<bigint, EscrowRecord>();
  const key = (e: EventRecord) => `${e.transactionHash}:${e.logIndex}`;
  const port: ProjectionStore = {
    findEvent: async (e) => journal.get(key(e)) ?? null,
    appendEvent: async (e) => {
      journal.set(key(e), e);
    },
    findEscrow: async (id) => escrows.get(id) ?? null,
    createEscrow: async (r) => {
      escrows.set(r.id, r);
    },
    resolveEscrow: async (id, fields) => {
      escrows.set(id, { ...escrows.get(id)!, ...fields });
    },
  };
  return { port, journal, escrows };
}
const terminal = (name: EventRecord['name'], actor: Hex = beneficiary): Observation => ({
  ...creation,
  created: undefined,
  name,
  actor,
  logIndex: 1,
  payload: name,
});
test('duplicate creation and resolution never reset terminal state or append twice', async () => {
  const s = store();
  await project(creation, s.port);
  await project(terminal('EscrowReleased'), s.port);
  assert.equal(await project(creation, s.port), 'duplicate');
  assert.equal(await project(terminal('EscrowReleased'), s.port), 'duplicate');
  assert.equal(s.journal.size, 2);
  assert.equal(s.escrows.get(1n)?.status, 'Released');
  assert.equal(s.escrows.get(1n)?.amount, (1n << 256n) - 1n);
});
for (const field of [
  'payload',
  'blockHash',
  'blockNumber',
  'actor',
  'data',
  'topics',
  'transactionIndex',
  'escrowId',
  'name',
] as const) {
  test(`conflicting duplicate ${field} fails without changing state`, async () => {
    const s = store();
    await project(creation, s.port);
    const alternatives = {
      payload: 'conflict',
      blockHash: `0x${'cd'.repeat(32)}`,
      blockNumber: 4n,
      actor: beneficiary,
      data: '0x01',
      topics: ['0x01'],
      transactionIndex: 2,
      escrowId: 2n,
      name: 'EscrowReleased',
    };
    await assert.rejects(
      project({ ...creation, [field]: alternatives[field] } as Observation, s.port),
      /Conflicting event identity/,
    );
    assert.equal(s.journal.size, 1);
    assert.equal(s.escrows.get(1n)?.status, 'Pending');
  });
}
test('missing creation, wrong actor and a new competing terminal event fail', async () => {
  const s = store();
  await assert.rejects(project(terminal('EscrowReleased'), s.port), /Invalid escrow transition/);
  assert.equal(s.journal.size, 0);
  await project(creation, s.port);
  await assert.rejects(project(terminal('EscrowReleased', sender), s.port), /Invalid escrow transition/);
  await project(terminal('EscrowRejected'), s.port);
  await assert.rejects(
    project({ ...terminal('EscrowReleased'), logIndex: 2 }, s.port),
    /Invalid escrow transition/,
  );
  assert.equal(s.journal.size, 2);
});
for (const [name, actor, status] of [
  ['EscrowCancelled', sender, 'CancelledBySender'],
  ['EscrowReleased', beneficiary, 'Released'],
  ['EscrowRejected', beneficiary, 'Rejected'],
  ['EscrowExpired', sender, 'Expired'],
] as const) {
  test(`${name} retains parties and successful transaction trace`, async () => {
    const s = store();
    await project(creation, s.port);
    await project(terminal(name, actor), s.port);
    const row = s.escrows.get(1n)!;
    assert.equal(row.status, status);
    assert.equal(row.sender, sender);
    assert.equal(row.beneficiary, beneficiary);
    assert.equal(row.creationTransactionHash, hash);
    assert.equal(row.resolutionTransactionHash, hash);
  });
}
test('configuration rejects invalid scope/policy/descriptor; defaults retain chosen units', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'remitee-config-'));
  try {
    const file = resolve(dir, 'deployment.json');
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        abiVersion: 'escrow-v1',
        chainId: 31337,
        genesisHash: hash,
        address: sender,
        deploymentBlock: 1,
        deploymentHash: hash,
        deploymentTransactionHash: hash,
        codeHash: hash,
      }),
    );
    const env = {
      RPC_URL: 'http://127.0.0.1',
      DATABASE_URL: 'postgres://localhost/local',
      DEPLOYMENT_FILE: file,
    };
    const config = settings(env);
    assert.equal(config.confirmationDelay, 2);
    assert.equal(config.reorgWindow, 180);
    assert.equal(settings({ ...env, API_PORT: '3001' }).scopeKey, config.scopeKey);
    assert.throws(() => settings({ ...env, API_PORT: '42069' }), /must differ/);
    for (const extra of [
      { INDEXER_SCHEMA: 'public' },
      { INDEXER_SCHEMA: 'x;DROP' },
      { REORG_WINDOW_SECONDS: '0' },
      { CONFIRMATION_DELAY: '-1' },
      { INDEXER_PORT: 'NaN' },
    ])
      assert.throws(() => settings({ ...env, ...extra }));
    assert.notEqual(settings({ ...env, CONFIRMATION_DELAY: '3' }).scopeKey, config.scopeKey);
    assert.throws(() => deployment({}), /Invalid deployment/);
    await assert.rejects(chainReader(config).rpc('eth_sendTransaction', []), /rpc_method_not_readonly/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
