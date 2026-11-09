import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import type pg from 'pg';
import { keccak256 } from 'viem';
import {
  assertApiResponse,
  checkSpecification,
  specification,
  specPath,
} from '../../../scripts/api-spec.ts';
import {
  effectiveStatuses,
  eligibility,
  InputError,
  parseRequest,
  publicEscrow,
  statuses,
  UINT256_MAX,
} from '../api/domain.ts';
import { unavailabilityReasons } from '../api/errors.ts';
import { health } from '../api/health.ts';
import { apiServer } from '../api/server.ts';
import type { Settings } from '../config.ts';
import { newReadTrace, queryObservation } from '../read-model.ts';

test('OpenAPI structure, registered routes, runtime enums and examples agree', async () => {
  await checkSpecification();
  assert.deepEqual([...statuses], specification.components.schemas.OnChainStatus.enum);
  assert.deepEqual([...effectiveStatuses], specification.components.schemas.EffectiveStatus.enum);
  assert.deepEqual(
    [...unavailabilityReasons],
    specification.components.schemas.UnavailabilityReason.enum,
  );
});
test('strict input parsing preserves large IDs, defaults and normalized AND filters', () => {
  assert.deepEqual(parseRequest(`/escrows/${UINT256_MAX}`), {
    kind: 'detail',
    id: UINT256_MAX.toString(),
  });
  assert.deepEqual(parseRequest('/escrows/9007199254740993'), {
    kind: 'detail',
    id: '9007199254740993',
  });
  assert.deepEqual(parseRequest('/escrows'), { kind: 'list', limit: 20, offset: 0 });
  assert.deepEqual(
    parseRequest(
      `/escrows?sender=0x${'AB'.repeat(20)}&beneficiary=0x${'CD'.repeat(20)}&status=ExpiredRecoverable&limit=100&offset=10000`,
    ),
    {
      kind: 'list',
      sender: `0x${'ab'.repeat(20)}`,
      beneficiary: `0x${'cd'.repeat(20)}`,
      status: 'ExpiredRecoverable',
      limit: 100,
      offset: 10000,
    },
  );
  assert.deepEqual(parseRequest('/escrows?sender=0x0000000000000000000000000000000000000000'), {
    kind: 'list',
    sender: '0x0000000000000000000000000000000000000000',
    limit: 20,
    offset: 0,
  });
});
const invalidRequests = [
  '/escrows/0',
  '/escrows/01',
  '/escrows/-1',
  '/escrows/1.0',
  '/escrows/0x01',
  '/escrows/1e2',
  '/escrows/%zz',
  `/escrows/${UINT256_MAX + 1n}`,
  `/escrows/${'1'.repeat(79)}`,
  '/escrows/1?limit=1',
  '/escrows?sender=',
  '/escrows?sender=0x11',
  '/escrows?status=expired',
  '/escrows?status=Frozen',
  '/escrows?limit=0',
  '/escrows?limit=101',
  '/escrows?limit=01',
  '/escrows?limit=+1',
  '/escrows?limit=1.5',
  '/escrows?limit=1e2',
  '/escrows?limit=0x10',
  '/escrows?offset=-1',
  '/escrows?offset=10001',
  '/escrows?limit=1&limit=2',
  '/escrows?unknown=1',
  '/escrows?status=Pending&status=Expired',
  '/escrows?sender=%zz',
  '/health?status=Pending',
  '/openapi.yaml?x=1',
];
test('malformed, repeated, unknown and out-of-range inputs are rejected without coercion', () => {
  for (const request of invalidRequests)
    assert.throws(() => parseRequest(request), InputError, request);
});
test('request validation preserves query-before-ID and pagination-before-filter precedence', () => {
  for (const [request, parameter] of [
    ['/escrows/%zz?unknown=1', 'query'],
    ['/escrows?limit=bad&offset=bad&sender=bad', 'limit'],
    ['/escrows?offset=bad&sender=bad', 'offset'],
  ]) {
    assert.throws(
      () => parseRequest(request!),
      (error: unknown) => error instanceof InputError && error.parameter === parameter,
    );
  }
  assert.deepEqual(parseRequest('/unknown?bad=%zz'), { kind: 'not_found' });
});
test('both deadlines use exact role/time rules and terminal outcomes never regain eligibility', () => {
  for (const [now, cancel, recover, status] of [
    [8199n, true, false, 'Pending'],
    [8200n, false, false, 'Pending'],
    [8201n, false, false, 'Pending'],
    [605799n, false, false, 'Pending'],
    [605800n, false, true, 'ExpiredRecoverable'],
    [605801n, false, true, 'ExpiredRecoverable'],
  ] as const)
    assert.deepEqual(eligibility('Pending', 8200n, 605800n, now), {
      canCancel: cancel,
      canRecover: recover,
      effectiveStatus: status,
    });
  for (const state of ['Released', 'CancelledBySender', 'Rejected', 'Expired'] as const)
    assert.deepEqual(eligibility(state, 8200n, 605800n, 900000n), {
      canCancel: false,
      canRecover: false,
      effectiveStatus: state,
    });
});
test('serialization preserves maximum integers and rejects inconsistent recorded resolution facts', () => {
  const row = {
    id: UINT256_MAX.toString(),
    sender: `0x${'AB'.repeat(20)}`,
    beneficiary: `0x${'CD'.repeat(20)}`,
    token: `0x${'EF'.repeat(20)}`,
    amount: UINT256_MAX.toString(),
    created_at: '1000',
    cancel_deadline: '8200',
    expires_at: ((1n << 64n) - 1n).toString(),
    status: 'Pending',
    creation_transaction_hash: `0x${'AB'.repeat(32)}`,
    resolution_transaction_hash: null,
  };
  const record = publicEscrow(row, 9000n);
  assert.equal(record.id, UINT256_MAX.toString());
  assert.equal(record.amount, UINT256_MAX.toString());
  assert.equal(record.expiresAt, '18446744073709551615');
  assert.equal(record.sender, row.sender.toLowerCase());
  assert.equal(record.canCancel, false);
  for (const patch of [
    { amount: (UINT256_MAX + 1n).toString() },
    { id: 9007199254740992 },
    { expires_at: (1n << 64n).toString() },
    { status: 'Released' },
    { resolution_transaction_hash: `0x${'aa'.repeat(32)}` },
  ])
    assert.throws(() => publicEscrow({ ...row, ...patch }, 9000n));
});
test('HTTP validation and static specification work without touching RPC or PostgreSQL', async () => {
  let connections = 0;
  const pool = {
    connect: () => {
      connections++;
      throw new Error('must not be called');
    },
  } as unknown as pg.Pool;
  const server = apiServer({} as Settings, pool, specPath);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  try {
    for (const request of invalidRequests) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}${request}`);
      assert.equal(response.status, 400, request);
      const path = request.startsWith('/health')
        ? '/health'
        : request.startsWith('/escrows/')
          ? '/escrows/{id}'
          : '/escrows';
      assertApiResponse(path, 400, await response.json(), response.headers.get('cache-control')!);
    }
    const definition = await fetch(`http://127.0.0.1:${address.port}/openapi.yaml`);
    assert.equal(definition.status, 200);
    assert.match(await definition.text(), /^openapi: 3.1.0/);
    assert.equal(connections, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('malformed RPC head headers are rejected before opening a database connection', async () => {
  const hash = `0x${'ab'.repeat(32)}`;
  const contract = `0x${'11'.repeat(20)}`;
  let latest: Record<string, unknown> = {};
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { method, params, id } = JSON.parse(raw);
    const result =
      method === 'eth_chainId'
        ? '0x7a69'
        : method === 'eth_getCode'
          ? '0x6000'
          : method === 'eth_getTransactionReceipt'
            ? { status: '0x1', contractAddress: contract, blockHash: hash }
            : params[0] === 'latest'
              ? latest
              : { number: params[0], hash, timestamp: '0x100' };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  let connections = 0;
  const pool = {
    connect: () => {
      connections++;
      throw new Error('DB must not be touched');
    },
  } as unknown as pg.Pool;
  const config: Settings = {
    deployment: {
      version: 1,
      abiVersion: 'escrow-v1',
      chainId: 31337,
      genesisHash: hash as `0x${string}`,
      address: contract as `0x${string}`,
      deploymentBlock: 1,
      deploymentHash: hash as `0x${string}`,
      deploymentTransactionHash: hash as `0x${string}`,
      codeHash: keccak256('0x6000'),
    },
    rpcUrl: `http://127.0.0.1:${address.port}`,
    databaseUrl: 'postgres://unused/local',
    schema: 'unused',
    confirmationDelay: 2,
    reorgWindow: 180,
    pollMs: 100,
    port: 42069,
    apiPort: 3000,
    scopeKey: '',
    startupMinBlock: 0n,
  };
  try {
    for (const header of [
      { number: '0xc', hash },
      { number: '0xc', hash: 'bad', timestamp: '0x100' },
      { number: 'NaN', hash, timestamp: '0x100' },
      { number: '0xc', hash, timestamp: '0x10000000000000000' },
    ]) {
      latest = header;
      await assert.rejects(
        queryObservation(config, pool, async () => null),
        (error: unknown) => (error as { code?: string }).code === 'rpc_unavailable',
      );
    }
    assert.equal(connections, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function observationFixture(
  options: { rpcDown?: boolean; head?: string; missingCheckpoint?: boolean } = {},
) {
  const hash = `0x${'ab'.repeat(32)}` as `0x${string}`;
  const contract = `0x${'11'.repeat(20)}` as `0x${string}`;
  const rpc = createServer(async (request, response) => {
    if (options.rpcDown) {
      response.writeHead(503).end();
      return;
    }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const { method, params, id } = JSON.parse(raw);
    let result: unknown;
    switch (method) {
      case 'eth_chainId':
        result = '0x7a69';
        break;
      case 'eth_getCode':
        result = '0x6000';
        break;
      case 'eth_getTransactionReceipt':
        result = { status: '0x1', contractAddress: contract, blockHash: hash };
        break;
      default:
        result = {
          number: params[0] === 'latest' ? (options.head ?? '0xc') : params[0],
          hash,
          timestamp: '0x100',
        };
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  });
  const engine = createServer((_request, response) => response.writeHead(503).end());
  const port = async (server: ReturnType<typeof createServer>) => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    return address.port;
  };
  const rpcPort = await port(rpc);
  const enginePort = await port(engine);
  const config: Settings = {
    deployment: {
      version: 1,
      abiVersion: 'escrow-v1',
      chainId: 31337,
      genesisHash: hash,
      address: contract,
      deploymentBlock: 1,
      deploymentHash: hash,
      deploymentTransactionHash: hash,
      codeHash: keccak256('0x6000'),
    },
    rpcUrl: `http://127.0.0.1:${rpcPort}`,
    databaseUrl: 'postgres://unused/local',
    schema: 'unused',
    confirmationDelay: 2,
    reorgWindow: 180,
    pollMs: 100,
    port: enginePort,
    apiPort: 3000,
    scopeKey: 'test-scope',
    startupMinBlock: 0n,
  };
  const checkpoint = { scope_key: config.scopeKey, number: '0', hash, timestamp: '256' };
  const commands: string[] = [];
  const client = {
    async query(sql: string) {
      const readsCheckpoint = sql.startsWith('SELECT');
      commands.push(readsCheckpoint ? 'checkpoint' : sql);
      if (readsCheckpoint && options.missingCheckpoint) {
        throw Object.assign(new Error('Checkpoint table is missing'), { code: '42P01' });
      }
      return { rows: [checkpoint] };
    },
    release() {
      commands.push('release');
    },
  };
  const pool = {
    async connect() {
      return client;
    },
    query: client.query,
  } as unknown as pg.Pool;
  const close = async () => {
    for (const server of [rpc, engine]) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
  return { config, pool, commands, close };
}

test('health preserves RPC failure over engine unreadiness and reports only partial database diagnostics', async () => {
  const fixture = await observationFixture({ rpcDown: true });
  try {
    const result = await health(fixture.config, fixture.pool);
    assert.equal(result.status, 503);
    assert.equal(result.body.reason, 'rpc_unavailable');
    assert.equal(result.body.observation, null);
    assert.deepEqual(result.body.components, {
      rpc: 'down',
      database: 'up',
      indexer: 'catching_up',
    });
    assert.equal(result.body.diagnostics?.observedHead, null);
    assert.equal(result.body.diagnostics?.indexedThrough?.number, '0');
    assert.equal(result.body.diagnostics?.headLag, null);
    assert.equal(result.body.diagnostics?.eligibleBacklog, null);
    assert.deepEqual(fixture.commands, ['checkpoint']);
    assertApiResponse('/health', result.status, result.body, 'no-store');
  } finally {
    await fixture.close();
  }
});

test('a head below the confirmation delay rejects block zero after releasing the snapshot', async () => {
  const fixture = await observationFixture({ head: '0x1' });
  const trace = newReadTrace();
  try {
    await assert.rejects(
      queryObservation(fixture.config, fixture.pool, async () => null, trace),
      (error: unknown) => (error as { code?: string }).code === 'checkpoint_not_eligible',
    );
    assert.equal(trace.scopeMatched, true);
    assert.deepEqual(fixture.commands, [
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'checkpoint',
      'COMMIT',
      'release',
    ]);
  } finally {
    await fixture.close();
  }
});

test('a failing snapshot callback rolls back, releases the connection and remains a database failure', async () => {
  const fixture = await observationFixture();
  const trace = newReadTrace();
  try {
    await assert.rejects(
      queryObservation(
        fixture.config,
        fixture.pool,
        async () => {
          throw new Error('query failed');
        },
        trace,
      ),
      (error: unknown) => (error as { code?: string }).code === 'database_unavailable',
    );
    assert.equal(trace.database, 'down');
    assert.deepEqual(fixture.commands, [
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'checkpoint',
      'ROLLBACK',
      'release',
    ]);
  } finally {
    await fixture.close();
  }
});

test('a missing checkpoint table is an unavailable observation, not an unreachable database', async () => {
  for (const rpcDown of [false, true]) {
    const fixture = await observationFixture({ rpcDown, missingCheckpoint: true });
    try {
      const result = await health(fixture.config, fixture.pool);
      assert.equal(result.status, 503);
      assert.equal(result.body.reason, rpcDown ? 'rpc_unavailable' : 'checkpoint_unavailable');
      assert.equal(result.body.components.database, 'up');
      assert.equal(result.body.observation, null);
      assert.equal(result.body.diagnostics?.indexedThrough, null);
      assertApiResponse('/health', result.status, result.body, 'no-store');
    } finally {
      await fixture.close();
    }
  }
});
