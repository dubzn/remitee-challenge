import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { assertApiResponse } from '../../../scripts/api-spec.ts';
import { settings } from '../config.ts';
import { connection, queryObservation } from '../read-model.ts';

export async function apiRequest(url: string, path: string) {
  const response = await fetch(url + path, { signal: AbortSignal.timeout(12_000) });
  const body = (await response.json()) as any;
  assertApiResponse(
    path.split('?')[0] === '/health'
      ? '/health'
      : path.startsWith('/escrows/')
        ? '/escrows/{id}'
        : '/escrows',
    response.status,
    body,
    response.headers.get('cache-control')!,
  );
  return { status: response.status, body };
}
type Context = {
  root: string;
  runtime: string;
  url: string;
  env: NodeJS.ProcessEnv;
  sender: string;
  beneficiary: string;
  db: pg.Client;
  rpc: (method: string, params?: unknown[]) => Promise<any>;
  until: (label: string, check: () => Promise<boolean>, timeout?: number) => Promise<void>;
  freePort: () => Promise<number>;
  stop: (child: ChildProcess) => Promise<void>;
  record: (name: string, details: unknown) => void;
};
export async function exerciseApi(context: Context) {
  const { url, sender, beneficiary, db, record } = context;
  await context.until(
    'public read API ready',
    async () => (await apiRequest(url, '/health')).status === 200,
  );
  const list = await apiRequest(url, '/escrows');
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.body.items.map((r: any) => r.id),
    ['5', '4', '3', '2', '1'],
  );
  assert.equal(list.body.observation.chainId, '31337');
  const detail = await apiRequest(url, '/escrows/1');
  assert.equal(detail.body.escrow.amount, ((1n << 256n) - 1n).toString());
  assert.equal(detail.body.escrow.onChainStatus, 'Released');
  assert.equal(detail.body.escrow.effectiveStatus, 'Released');
  assert.equal(detail.body.escrow.canRecover, false);
  assert.equal(detail.body.escrow.canCancel, false);
  const physical = (await db.query('SELECT * FROM acceptance.escrows WHERE id=1')).rows[0];
  assert.equal(detail.body.escrow.creationTxHash, physical.creation_transaction_hash);
  assert.equal(detail.body.escrow.resolutionTxHash, physical.resolution_transaction_hash);
  for (const [status, expected] of [
    ['Released', ['1']],
    ['CancelledBySender', ['2']],
    ['Rejected', ['3']],
    ['Expired', ['4']],
    ['ExpiredRecoverable', ['5']],
    ['Pending', []],
  ] as const) {
    const result = await apiRequest(url, `/escrows?status=${status}&limit=1`);
    assert.equal(result.status, 200);
    assert.deepEqual(
      result.body.items.map((r: any) => r.id),
      expected,
    );
  }
  for (const query of [
    `sender=${sender}`,
    `beneficiary=${beneficiary}`,
    `sender=${sender}&beneficiary=${beneficiary}`,
    `sender=0x${sender.slice(2).toUpperCase()}&status=Released&limit=1`,
  ]) {
    const result = await apiRequest(url, `/escrows?${query}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, query.includes('status=') ? 1 : 5);
  }
  const mismatch = await apiRequest(url, `/escrows?sender=${sender}&beneficiary=${sender}`);
  assert.deepEqual(mismatch.body.items, []);
  const page = await apiRequest(url, '/escrows?limit=2&offset=1');
  assert.deepEqual(
    page.body.items.map((r: any) => r.id),
    ['4', '3'],
  );
  assert.deepEqual(page.body.page, { limit: 2, offset: 1, hasMore: true });
  const lastPage = await apiRequest(url, '/escrows?limit=2&offset=4');
  assert.deepEqual(
    lastPage.body.items.map((r: any) => r.id),
    ['1'],
  );
  assert.equal(lastPage.body.page.hasMore, false);
  assert.deepEqual((await apiRequest(url, '/escrows?offset=10000')).body.items, []);
  for (const id of ['999', '9007199254740993', ((1n << 256n) - 1n).toString()]) {
    const absent = await apiRequest(url, `/escrows/${id}`);
    assert.equal(absent.status, 404);
    assert.equal(absent.body.error.message, 'Escrow was not found in the indexed blocks.');
    assert(absent.body.observation.indexedThrough.hash);
  }
  let healthy: Awaited<ReturnType<typeof apiRequest>>;
  await context.until('expected confirmation lag distinguished from eligible backlog', async () => {
    healthy = await apiRequest(url, '/health');
    return (
      healthy.status === 200 &&
      healthy.body.observation.headLag === '2' &&
      healthy.body.observation.eligibleBacklog === '0'
    );
  });
  assert.equal(healthy!.body.ready, true);
  assert.equal(healthy!.body.observation.confirmationDelay, 2);
  const again = await apiRequest(url, '/health');
  assert.equal(again.status, 200);
  assert.equal(
    again.body.observation.observedHead.timestamp,
    healthy!.body.observation.observedHead.timestamp,
  );
  record(
    'S3 HTTP detail, all statuses, AND filters, pagination, exact amounts and absence from indexed blocks',
    { schemasChecked: true, filtersBeforePagination: true, idleHeadHealthy: true },
  );

  const config = settings(context.env);
  const pool = connection(config);
  try {
    let before = '';
    const snapshot = await queryObservation(config, pool, async (client) => {
      before = (await client.query('SELECT number::text FROM acceptance.checkpoint WHERE id=1'))
        .rows[0].number;
      await context.rpc('anvil_mine', [3, 1]);
      await context.until(
        'writer advances beyond reader snapshot',
        async () =>
          BigInt(
            (await db.query('SELECT number::text FROM acceptance.checkpoint WHERE id=1')).rows[0]
              .number,
          ) > BigInt(before),
      );
      assert.equal(
        (await client.query('SELECT number::text FROM acceptance.checkpoint WHERE id=1')).rows[0]
          .number,
        before,
      );
      return (await client.query('SELECT count(*)::int AS n FROM acceptance.escrows')).rows[0].n;
    });
    assert.equal(snapshot.data, 5);
    assert.equal(snapshot.observation.indexedThrough.number, before);
    record('S3 repeatable-read snapshot remains coherent while the actual Ponder writer advances', {
      snapshot: before,
      count: snapshot.data,
    });
  } finally {
    await pool.end();
  }

  const standalone = async (label: string, extra: NodeJS.ProcessEnv) => {
    const port = await context.freePort();
    const log = createWriteStream(resolve(context.runtime, `read-api-${label}.log`));
    const child = spawn(process.execPath, [resolve(context.root, 'scripts/read-api.ts')], {
      cwd: context.root,
      detached: true,
      env: { ...context.env, API_PORT: String(port), INDEXER_STARTUP_MIN_BLOCK: '0', ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout!.pipe(log, { end: false });
    child.stderr!.pipe(log, { end: false });
    child.on('close', () => log.end());
    return {
      child,
      url: `http://127.0.0.1:${port}`,
      log: resolve(context.runtime, `read-api-${label}.log`),
    };
  };
  for (const [label, extra, reason] of [
    [
      'database-unavailable',
      {
        DATABASE_URL: `postgres://remitee:remitee_local_only@127.0.0.1:${await context.freePort()}/remitee`,
      },
      'database_unavailable',
    ],
    [
      'startup-floor',
      {
        INDEXER_STARTUP_MIN_BLOCK: (
          BigInt(await context.rpc('eth_blockNumber')) + 1000n
        ).toString(),
      },
      'startup_catchup',
    ],
    [
      'engine-unavailable',
      { INDEXER_PORT: String(await context.freePort()) },
      'indexer_unavailable',
    ],
  ] as const) {
    const instance = await standalone(label, extra);
    try {
      await context.until(
        `${label} API listener`,
        async () => (await fetch(`${instance.url}/openapi.yaml`)).status === 200,
      );
      assert.equal((await apiRequest(instance.url, '/escrows/0')).status, 400);
      const unavailable = await apiRequest(instance.url, '/escrows/1');
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.body.error.reason, reason);
      const absent = await apiRequest(instance.url, '/escrows/999');
      assert.equal(absent.status, 503);
      assert.equal(absent.body.error.reason, reason);
      const status = await apiRequest(instance.url, '/health');
      assert.equal(status.status, 503);
      assert.equal(status.body.reason, reason);
      assert.equal(status.body.observation, null);
      assert.equal(status.body.diagnostics.confirmationDelay, 2);
      if (reason === 'startup_catchup') {
        assert.equal(status.body.components.indexer, 'catching_up');
        assert.notEqual(status.body.diagnostics.eligibleBacklog, null);
      } else if (reason === 'database_unavailable') {
        assert.equal(status.body.components.database, 'down');
        assert.equal(status.body.components.indexer, 'unknown');
        assert.equal(status.body.diagnostics.indexedThrough, null);
      } else {
        assert.deepEqual(status.body.components, {
          rpc: 'up',
          database: 'up',
          indexer: 'unavailable',
        });
        assert.notEqual(status.body.diagnostics.headLag, null);
        assert.notEqual(status.body.diagnostics.eligibleBacklog, null);
      }
      const raw = await fetch(`${instance.url}/openapi.yaml`);
      assert.equal(raw.status, 200);
      assert.match(await raw.text(), /^openapi: 3.1.0/);
    } finally {
      await context.stop(instance.child);
    }
  }
  const missing = await standalone('missing-floor', { INDEXER_STARTUP_MIN_BLOCK: undefined });
  try {
    await context.until('API missing floor refused', async () => missing.child.exitCode !== null);
    assert.notEqual(missing.child.exitCode, 0);
    await context.until('API missing floor diagnostic', async () =>
      /Shared launcher startup floor is required/.test(readFileSync(missing.log, 'utf8')),
    );
    assert.match(readFileSync(missing.log, 'utf8'), /Shared launcher startup floor is required/);
  } finally {
    await context.stop(missing.child);
  }
  const invalidDescriptor = resolve(context.runtime, 'api-invalid-deployment.json');
  const descriptor = JSON.parse(
    readFileSync(resolve(context.root, context.env.DEPLOYMENT_FILE!), 'utf8'),
  );
  writeFileSync(
    invalidDescriptor,
    JSON.stringify({ ...descriptor, codeHash: `0x${'ab'.repeat(32)}` }),
  );
  for (const [label, extra, diagnostic] of [
    ['wrong-deployment', { DEPLOYMENT_FILE: invalidDescriptor }, 'deployment_identity_mismatch'],
    [
      'rpc-down-at-startup',
      { RPC_URL: `http://127.0.0.1:${await context.freePort()}` },
      'rpc_unavailable',
    ],
  ] as const) {
    const instance = await standalone(label, extra);
    try {
      await context.until(
        `${label} refused before listening`,
        async () => instance.child.exitCode !== null,
      );
      assert.notEqual(instance.child.exitCode, 0);
      await context.until(`${label} startup diagnostic`, async () =>
        readFileSync(instance.log, 'utf8').includes(diagnostic),
      );
      const output = readFileSync(instance.log, 'utf8');
      assert.match(output, /READ_API_START_REFUSED/);
      assert.doesNotMatch(output, /READ_API_LISTENING/);
    } finally {
      await context.stop(instance.child);
    }
  }
  record('standalone API validates deployment and RPC before listening', {
    wrongDescriptorRefused: true,
    unavailableRpcRefused: true,
  });
  record(
    'S3 real HTTP database failure, startup-floor gating and readiness-independent raw specification',
    { staticDocs: true, noStandaloneFloorBypass: true },
  );
}

export async function exerciseTimeBoundaries(
  context: Pick<Context, 'url' | 'db' | 'rpc' | 'until' | 'record'>,
) {
  const record = (await apiRequest(context.url, '/escrows/6')).body.escrow;
  const count = (await context.db.query('SELECT count(*)::int AS n FROM acceptance.journal'))
    .rows[0].n;
  const cancellation = BigInt(record.cancelDeadline);
  const expiry = BigInt(record.expiresAt);
  for (const now of [
    cancellation - 1n,
    cancellation,
    cancellation + 1n,
    expiry - 1n,
    expiry,
    expiry + 1n,
  ]) {
    await context.rpc('evm_setNextBlockTimestamp', [Number(now)]);
    await context.rpc('anvil_mine', [1, 1]);
    let response: any;
    await context.until('API time-boundary observation', async () => {
      response = await apiRequest(context.url, '/escrows/6');
      return (
        response.status === 200 &&
        response.body.observation.observedHead.timestamp === now.toString()
      );
    });
    assert.equal(response.body.escrow.onChainStatus, 'Pending');
    assert.equal(response.body.escrow.canCancel, now < cancellation);
    assert.equal(response.body.escrow.canRecover, now >= expiry);
    assert.equal(
      response.body.escrow.effectiveStatus,
      now >= expiry ? 'ExpiredRecoverable' : 'Pending',
    );
    assert.equal(response.body.escrow.resolutionTxHash, null);
    for (const status of ['Pending', 'ExpiredRecoverable']) {
      const filtered = await apiRequest(context.url, `/escrows?status=${status}`);
      assert.equal(filtered.status, 200);
      assert.equal(filtered.body.observation.observedHead.timestamp, now.toString());
      const includes = filtered.body.items.some((item: any) => item.id === '6');
      assert.equal(includes, status === 'Pending' ? now < expiry : now >= expiry);
    }
  }
  assert.equal(
    (await context.db.query('SELECT count(*)::int AS n FROM acceptance.journal')).rows[0].n,
    count,
  );
  context.record(
    'S3 exact HTTP cancellation/expiry boundaries without a synthetic event or recovery transaction',
    { boundaries: 6, unchangedJournal: true },
  );
}
