import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import pg from 'pg';
import { createPublicClient, createWalletClient, http, maxUint256, keccak256 } from 'viem';
import type { Address, Hex } from 'viem';
import { anvil } from 'viem/chains';
import { compileArtifacts } from '../../../scripts/build-artifacts.ts';
import { captureDeployment } from '../../../scripts/deployment-manifest.ts';
import { settings } from '../config.ts';
import { chainReader } from '../rpc.ts';
import { apiRequest, exerciseApi, exerciseTimeBoundaries } from './api-acceptance.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const project =
  process.env.REMITEE_INDEXER_TEST_PROJECT ??
  `remitee-indexer-check-${process.pid}-${randomBytes(4).toString('hex')}`;
assert.match(project, /^remitee-indexer-check-[a-z0-9-]+$/);
const runtime = resolve(root, '.local', project);
mkdirSync(runtime, { recursive: true });
const override = resolve(runtime, 'compose.yaml');
const manifestFile = resolve(runtime, 'deployment.json');
writeFileSync(
  override,
  'services:\n  anvil:\n    ports: ["127.0.0.1:0:8545"]\n  postgres:\n    ports: ["127.0.0.1:0:5432"]\n',
);
const observations: { name: string; details: unknown }[] = [];
const children: ChildProcess[] = [];
let db: pg.Client | undefined;
let proxy: ReturnType<typeof createServer> | undefined;
let rpcAvailable = true;
let duplicateLogs = false;
let duplicateResponses = 0;
let sequence = 0;
const command = (args: string[]) =>
  execFileSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 8_000_000 });
const compose = (args: string[]) =>
  command([
    'compose',
    '--project-directory',
    root,
    '-f',
    resolve(root, 'compose.yaml'),
    '-f',
    override,
    '-p',
    project,
    ...args,
  ]);
function record(name: string, details: unknown) {
  observations.push({ name, details });
  console.log(JSON.stringify({ pass: name, details }));
  writeFileSync(resolve(runtime, 'report.json'), JSON.stringify(observations, null, 2));
}
async function until(label: string, check: () => Promise<boolean>, timeout = 60_000) {
  const end = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch (error) {
      last = error;
    }
    await delay(150);
  }
  throw new Error(`Timed out: ${label}`, { cause: last });
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  if (signal === 'SIGKILL') process.kill(-child.pid!, signal);
  else child.kill(signal);
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {}
  }, 12_000);
  try {
    await done;
  } finally {
    clearTimeout(timer);
  }
}
async function freePort() {
  const s = createServer();
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  const a = s.address();
  assert(a && typeof a !== 'string');
  await new Promise<void>((r) => s.close(() => r()));
  return a.port;
}
console.log(`Indexer acceptance resources: ${project}; evidence: ${runtime}`);
try {
  const artifacts = compileArtifacts(runtime);
  compose(['up', '-d', '--wait', '--wait-timeout', '60', 'anvil', 'postgres']);
  const rpcUrl = `http://${compose(['port', 'anvil', '8545']).trim()}`;
  const databaseUrl = `postgres://remitee:remitee_local_only@${compose(['port', 'postgres', '5432']).trim()}/remitee`;
  db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  async function rpc(method: string, params: unknown[] = []): Promise<any> {
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(5_000),
    });
    const b = (await r.json()) as any;
    assert(!b.error, JSON.stringify(b.error));
    return b.result;
  }
  proxy = createServer(async (req, res) => {
    if (!rpcAvailable) {
      res.writeHead(503);
      res.end('RPC unavailable');
      return;
    }
    try {
      const parts: Buffer[] = [];
      for await (const chunk of req) parts.push(Buffer.from(chunk));
      const body = Buffer.concat(parts);
      const upstream = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      const result = (await upstream.json()) as any;
      const request = JSON.parse(body.toString()) as { method: string };
      if (duplicateLogs && request.method === 'eth_getLogs' && result.result?.length) {
        result.result = [...result.result, ...result.result];
        duplicateResponses++;
      }
      res.writeHead(upstream.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(502);
      res.end('Upstream unavailable');
    }
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const a = proxy.address();
  assert(a && typeof a !== 'string');
  const proxyUrl = `http://127.0.0.1:${a.port}`;
  const client = createPublicClient({ chain: anvil, transport: http(rpcUrl, { retryCount: 0 }) });
  const accounts = (await rpc('eth_accounts')) as Address[];
  const sender = accounts[0]!;
  const beneficiary = accounts[1]!;
  const wallet = createWalletClient({ chain: anvil, account: sender, transport: http(rpcUrl) });
  const other = createWalletClient({ chain: anvil, account: beneficiary, transport: http(rpcUrl) });
  const receipt = (hash: Hex) => client.waitForTransactionReceipt({ hash, pollingInterval: 20 });
  async function deploy() {
    const escrow = await receipt(
      await wallet.deployContract({ abi: artifacts.escrow.abi, bytecode: artifacts.escrow.bytecode.object }),
    );
    const token = await receipt(
      await wallet.deployContract({ abi: artifacts.token.abi, bytecode: artifacts.token.bytecode.object }),
    );
    return { escrow, token };
  }
  const deployed = await deploy();
  const escrow = deployed.escrow.contractAddress!;
  const token = deployed.token.contractAddress!;
  const manifest = await captureDeployment(
    rpcUrl,
    escrow,
    deployed.escrow.transactionHash,
    keccak256(artifacts.escrow.deployedBytecode.object),
  );
  writeFileSync(manifestFile, JSON.stringify(manifest));
  const cliFile = resolve(runtime, 'cli-deployment.json');
  const cliEnv = { ...process.env, RPC_URL: rpcUrl, DEPLOYMENT_FILE: cliFile };
  const deployCommand = [resolve(root, 'scripts/deploy-local.ts')];
  execFileSync(process.execPath, deployCommand, {
    cwd: root,
    env: cliEnv,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const localDescriptor = JSON.parse(readFileSync(cliFile, 'utf8'));
  assert.notEqual(localDescriptor.address, escrow);
  const nonceBefore = await client.getTransactionCount({ address: sender });
  execFileSync(process.execPath, deployCommand, {
    cwd: root,
    env: cliEnv,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(await client.getTransactionCount({ address: sender }), nonceBefore);
  record('local deploy CLI and validated reuse', { distinctDeployment: true, secondRunNoTransaction: true });

  await receipt(
    await wallet.writeContract({
      address: token,
      abi: artifacts.token.abi,
      functionName: 'mint',
      args: [sender, maxUint256],
    }),
  );
  await receipt(
    await wallet.writeContract({
      address: token,
      abi: artifacts.token.abi,
      functionName: 'approve',
      args: [escrow, maxUint256],
    }),
  );
  const create = (amount = 10n) =>
    wallet
      .writeContract({
        address: escrow,
        abi: artifacts.escrow.abi,
        functionName: 'createEscrow',
        args: [beneficiary, token, amount],
      })
      .then(receipt);
  const act = (name: string, id: bigint, byBeneficiary = false) =>
    (byBeneficiary ? other : wallet)
      .writeContract({ address: escrow, abi: artifacts.escrow.abi, functionName: name, args: [id] })
      .then(receipt);
  const firstCreation = await create(maxUint256);
  const firstRelease = await act('confirmEscrow', 1n, true);
  await receipt(
    await other.writeContract({
      address: token,
      abi: artifacts.token.abi,
      functionName: 'transfer',
      args: [sender, 100_000n],
    }),
  );
  for (let id = 2; id <= 5; id++) await create();
  await act('cancelEscrow', 2n);
  await act('rejectEscrow', 3n, true);
  const fourth = (await client.readContract({
    address: escrow,
    abi: artifacts.escrow.abi,
    functionName: 'getEscrow',
    args: [4n],
  })) as { expiresAt: bigint };
  await rpc('evm_setNextBlockTimestamp', [Number(fourth.expiresAt)]);
  await act('recoverExpiredEscrow', 4n);
  await rpc('anvil_mine', [2, 1]);
  const env = {
    ...process.env,
    RPC_URL: proxyUrl,
    DATABASE_URL: databaseUrl,
    DEPLOYMENT_FILE: relative(root, manifestFile),
    INDEXER_SCHEMA: 'acceptance',
    INDEXER_POLL_MS: '100',
    CONFIRMATION_DELAY: '2',
    REORG_WINDOW_SECONDS: '180',
  };
  const port = await freePort();
  const apiPort = await freePort();
  function start(schema = 'acceptance', extra: Record<string, string> = {}, replay = false) {
    const log = resolve(runtime, `indexer-${sequence++}.log`);
    const out = createWriteStream(log);
    const child = spawn(
      process.execPath,
      [resolve(root, 'scripts/indexer.ts'), ...(replay ? ['--replay'] : [])],
      {
        cwd: root,
        detached: true,
        env: { ...env, INDEXER_SCHEMA: schema, INDEXER_PORT: String(port), API_PORT: String(apiPort), ...extra },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout!.pipe(out);
    child.stderr!.pipe(out, { end: false });
    child.on('exit', () => out.end());
    children.push(child);
    return { child, log, url: `http://127.0.0.1:${port}` };
  }
  let running = start();
  let schema = 'acceptance';
  async function rows() {
    return (await db!.query(`SELECT * FROM ${schema}.escrows ORDER BY id`)).rows;
  }
  async function events() {
    return (await db!.query(`SELECT count(*)::int AS n FROM ${schema}.journal`)).rows[0].n as number;
  }
  async function checkpoint() {
    return (await db!.query(`SELECT * FROM ${schema}.checkpoint WHERE id=1`)).rows[0];
  }
  async function observed(resource = 'escrows'): Promise<{ status: number | null; body: any }> {
    try {
      const r = await fetch(`${running.url}/observed/${resource}`, { signal: AbortSignal.timeout(4_000) });
      return { status: r.status, body: await r.json() };
    } catch {
      return { status: null, body: {} };
    }
  }
  await until(
    'initial application history',
    async () => (await observed()).status === 200 && (await rows()).length === 5 && (await events()) === 9,
  );
  const initial = await rows();
  assert.deepEqual(
    initial.map((r) => r.status),
    ['Released', 'CancelledBySender', 'Rejected', 'Expired', 'Pending'],
  );
  assert.equal(initial[0].amount, maxUint256.toString());
  assert.equal(initial[0].creation_transaction_hash, firstCreation.transactionHash);
  assert.equal(initial[0].resolution_transaction_hash, firstRelease.transactionHash);
  duplicateLogs = false;
  record('history, all outcomes, uint256 max and successful transaction traces', {
    escrows: 5,
    events: 9,
    amount: initial[0].amount,
    traceHashes: true,
  });
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  await exerciseApi({
    root, runtime, url: apiUrl,
    env: { ...env, INDEXER_PORT: String(port), API_PORT: String(apiPort) },
    sender, beneficiary, db, rpc, until, freePort, stop, record,
  });
  const childRecord = readFileSync(running.log, 'utf8').split('\n').find(line => line.includes('"event":"APPLICATION_CHILDREN"'));
  assert(childRecord);
  process.kill(JSON.parse(childRecord).apiPid, 'SIGTERM');
  await until('API exit stops whole application', async () => running.child.exitCode !== null);
  assert.notEqual(running.child.exitCode, 0);
  await until('sibling Ponder listener closed', async () => (await observed()).status === null);
  running = start();
  await until('shared launcher restart', async () => (await apiRequest(apiUrl, '/health')).status === 200, 90_000);
  record('S3 shared launcher stops siblings and recomputes context on restart', { unexpectedChildExitRefused: true });
  const sixth = await create();
  await delay(500);
  assert.equal((await rows()).length, 5);
  await rpc('anvil_mine', [1, 1]);
  await delay(500);
  assert.equal((await rows()).length, 5);
  await rpc('anvil_mine', [1, 1]);
  await until('exact admission delay', async () => (await rows()).length === 6);
  await rpc('anvil_mine', [1, 1]);
  await until(
    'empty block advances progress',
    async () => BigInt((await checkpoint()).number) > sixth.blockNumber,
  );
  assert.equal(await events(), 10);
  record('N-1/N/N+1 admission and empty checkpoint', {
    delay: 2,
    visibleAtExtraBlocks: [false, false, true, true],
    events: 10,
  });
  await exerciseTimeBoundaries({ url: apiUrl, db, rpc, until, record });
  await stop(running.child);
  await create();
  await rpc('anvil_mine', [2, 1]);
  running = start();
  await until(
    'offline catch-up',
    async () => (await observed()).status === 200 && (await rows()).length === 7,
    90_000,
  );
  assert.equal(await events(), 11);
  record('same-build restart and offline catch-up', { escrows: 7, events: 11 });
  // Test-owned database trigger blocks the physical journal insert mid-transaction.
  // There are no fault switches or test handlers in the application.
  await db.query(
    `CREATE FUNCTION acceptance.crash_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.escrow_id=8 THEN PERFORM pg_advisory_xact_lock(7242206); END IF; RETURN NEW; END $$; CREATE TRIGGER crash_barrier BEFORE INSERT ON acceptance.journal FOR EACH ROW EXECUTE FUNCTION acceptance.crash_barrier()`,
  );
  await db.query('SELECT pg_advisory_lock(7242206)');
  const eighth = await create();
  await rpc('anvil_mine', [2, 1]);
  await until(
    'physical journal insert blocked',
    async () =>
      (
        await db!.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND pid<>pg_backend_pid()",
        )
      ).rowCount! > 0,
  );
  const partial = (
    await db.query(
      'SELECT (SELECT count(*)::int FROM acceptance.journal WHERE escrow_id=8) AS events,(SELECT count(*)::int FROM acceptance.escrows WHERE id=8) AS escrows,(SELECT number::text FROM acceptance.checkpoint WHERE id=1) AS checkpoint',
    )
  ).rows[0];
  assert.equal(partial.events, 0);
  assert.equal(partial.escrows, 0);
  assert(BigInt(partial.checkpoint) < eighth.blockNumber);
  await stop(running.child, 'SIGKILL');
  await db.query('SELECT pg_advisory_unlock(7242206)');
  await db.query(
    'DROP TRIGGER crash_barrier ON acceptance.journal; DROP FUNCTION acceptance.crash_barrier()',
  );
  running = start();
  await until(
    'abrupt recovery',
    async () => (await observed()).status === 200 && (await rows()).length === 8,
    90_000,
  );
  assert.equal(await events(), 12);
  await stop(running.child);
  running = start();
  await until('committed restart', async () => (await observed()).status === 200, 90_000);
  assert.equal(await events(), 12);
  record('physical transaction interruption and committed restart', { partial, escrows: 8, events: 12 });
  const competitor = start('acceptance', { INDEXER_PORT: String(await freePort()), API_PORT: String(await freePort()) });
  await until(
    'competitor excluded',
    async () =>
      competitor.child.exitCode !== null ||
      /locked|lock on|another instance/i.test(readFileSync(competitor.log, 'utf8')),
    30_000,
  );
  assert.match(readFileSync(competitor.log, 'utf8'), /schema is locked|lock on|another instance/i);
  await stop(competitor.child);
  assert.equal(await events(), 12);
  record('one framework writer', { events: 12 });
  rpcAvailable = false;
  assert.equal((await observed()).status, 503);
  assert.equal((await observed('health')).status, 503);
  assert.equal((await apiRequest(apiUrl, '/escrows')).status, 503);
  const rpcHealth = await apiRequest(apiUrl, '/health');
  assert.equal(rpcHealth.status, 503);
  assert.equal(rpcHealth.body.components.rpc, 'down');
  assert.equal(rpcHealth.body.diagnostics.observedHead, null);
  assert.equal((await fetch(`${apiUrl}/openapi.yaml`)).status, 200);
  assert.equal((await apiRequest(apiUrl, '/escrows/0')).status, 400);
  rpcAvailable = true;
  await until('RPC recovery', async () => (await observed()).status === 200);
  record('RPC loss blocks data and health', { recovered: true });
  const snap = await rpc('evm_snapshot');
  const ancestor = await client.getBlock();
  await rpc('evm_setNextBlockTimestamp', [Number(ancestor.timestamp + 1n)]);
  const release = await act('confirmEscrow', 8n, true);
  await rpc('anvil_mine', [2, 1]);
  await until(
    'release admitted',
    async () => (await observed()).body.items?.find((r: any) => r.id === '8')?.status === 'Released',
  );
  rpcAvailable = false;
  assert.equal(await rpc('evm_revert', [snap]), true);
  await rpc('evm_setNextBlockTimestamp', [Number(ancestor.timestamp + 2n)]);
  const reject = await act('rejectEscrow', 8n, true);
  assert.equal(reject.blockNumber, release.blockNumber);
  assert.notEqual(reject.blockHash, release.blockHash);
  await rpc('anvil_mine', [3, 1]);
  rpcAvailable = true;
  let samples = 0;
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    const r = await observed();
    if (r.status === 200) {
      const point = BigInt(r.body.observation.indexedThrough.number);
      assert.equal(
        r.body.observation.indexedThrough.hash,
        (await client.getBlock({ blockNumber: point })).hash,
      );
      assert.equal(
        r.body.items.find((row: any) => row.id === '8').status,
        point < reject.blockNumber ? 'Pending' : 'Rejected',
      );
    } else assert.equal(r.status, 503);
    const publicRead = await apiRequest(apiUrl, '/escrows/8');
    if (publicRead.status === 200) {
      const point = BigInt(publicRead.body.observation.indexedThrough.number);
      assert.equal(publicRead.body.observation.indexedThrough.hash, (await client.getBlock({ blockNumber: point })).hash);
      assert.equal(publicRead.body.escrow.onChainStatus, point < reject.blockNumber ? 'Pending' : 'Rejected');
    } else assert.equal(publicRead.status, 503);
    samples++;
    await delay(100);
  }
  await until(
    'canonical rollback',
    async () => (await observed()).body.items?.find((r: any) => r.id === '8')?.status === 'Rejected',
  );
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS n FROM acceptance.journal WHERE transaction_hash=$1', [
        release.transactionHash,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(await events(), 13);
  record('within-window canonical rollback', { samples, windowSeconds: 180, orphanAbsent: true });
  const deep = await rpc('evm_snapshot');
  const deepAncestor = await client.getBlock();
  await rpc('evm_setNextBlockTimestamp', [Number(deepAncestor.timestamp + 1n)]);
  const deepRelease = await act('confirmEscrow', 7n, true);
  await rpc('anvil_mine', [2, 1]);
  await until(
    'deep release admitted',
    async () => (await observed()).body.items?.find((r: any) => r.id === '7')?.status === 'Released',
  );
  const releaseHeader = await client.getBlock({ blockNumber: deepRelease.blockNumber });
  await rpc('evm_setNextBlockTimestamp', [Number(releaseHeader.timestamp + 181n)]);
  await rpc('evm_mine');
  await rpc('anvil_mine', [2, 1]);
  const finalized = (await client.getBlockNumber({ cacheTime: 0 })) - 2n;
  await until('window elapsed checkpoint', async () => BigInt((await checkpoint()).number) === finalized);
  assert((await client.getBlock({ blockNumber: finalized })).timestamp - releaseHeader.timestamp >= 180n);
  await delay(300);
  rpcAvailable = false;
  assert.equal(await rpc('evm_revert', [deep]), true);
  await rpc('evm_setNextBlockTimestamp', [Number(deepAncestor.timestamp + 2n)]);
  const deepReject = await act('rejectEscrow', 7n, true);
  assert.equal(deepReject.blockNumber, deepRelease.blockNumber);
  assert.notEqual(deepReject.blockHash, deepRelease.blockHash);
  await rpc('anvil_mine', [5, 1]);
  rpcAvailable = true;
  await until(
    'unrecoverable detection',
    async () => /Encountered unrecoverable.*reorg/.test(readFileSync(running.log, 'utf8')),
    30_000,
  );
  let blocked = 0;
  const blockedEnd = Date.now() + 60_000;
  while (Date.now() < blockedEnd) {
    assert.equal((await observed()).status, 503);
    assert.equal((await observed('health')).status, 503);
    assert.equal((await apiRequest(apiUrl, '/escrows')).status, 503);
    assert.equal((await apiRequest(apiUrl, '/health')).status, 503);
    blocked++;
    await delay(500);
  }
  await stop(running.child);
  running = start();
  await until('restart refusal', async () => running.child.exitCode !== null, 45_000);
  assert.notEqual(running.child.exitCode, 0);
  assert.notEqual((await observed()).status, 200);
  record('beyond-window fail-closed and restart', {
    rounds: blocked,
    durationMs: 60_000,
    restartExit: running.child.exitCode,
  });
  schema = 'validated_replay';
  running = start(schema, {}, true);
  await until(
    'explicit fresh replay',
    async () => (await observed()).body.items?.find((r: any) => r.id === '7')?.status === 'Rejected',
    90_000,
  );
  assert.equal(await events(), 14);
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS n FROM validated_replay.journal WHERE transaction_hash=$1', [
        deepRelease.transactionHash,
      ])
    ).rows[0].n,
    0,
  );
  record('explicit fresh-schema replay', { escrows: 8, events: 14 });
  const replayed = await apiRequest(apiUrl, '/escrows/7');
  assert.equal(replayed.status, 200);
  assert.equal(replayed.body.escrow.onChainStatus, 'Rejected');
  await stop(running.child);
  const wrongScope = start(schema, { CONFIRMATION_DELAY: '3' });
  await until('persisted scope refused', async () => wrongScope.child.exitCode !== null);
  assert.notEqual(wrongScope.child.exitCode, 0);
  assert.match(readFileSync(wrongScope.log, 'utf8'), /persisted_scope_mismatch/);
  assert.equal(await events(), 14);
  const replayExisting = start(schema, {}, true);
  await until('existing replay refused', async () => replayExisting.child.exitCode !== null);
  assert.notEqual(replayExisting.child.exitCode, 0);
  assert.match(readFileSync(replayExisting.log, 'utf8'), /replay_requires_new_schema/);
  const badManifest = resolve(runtime, 'bad-deployment.json');
  writeFileSync(badManifest, JSON.stringify({ ...manifest, codeHash: `0x${'ab'.repeat(32)}` }));
  const wrongCode = start(schema, { DEPLOYMENT_FILE: badManifest });
  await until('code identity refused', async () => wrongCode.child.exitCode !== null);
  assert.notEqual(wrongCode.child.exitCode, 0);
  assert.match(readFileSync(wrongCode.log, 'utf8'), /deployment_identity_mismatch/);
  duplicateLogs = true;
  const malformed = start('malformed_provider');
  await until('malformed duplicate RPC logs refused', async () => malformed.child.exitCode !== null, 45_000);
  assert.notEqual(malformed.child.exitCode, 0);
  assert.match(readFileSync(malformed.log, 'utf8'), /Inconsistent RPC response data/);
  assert(duplicateResponses > 0);
  assert.equal(await events(), 14);
  duplicateLogs = false;
  record('malformed duplicate log response refused', { existingDataPreserved: true, duplicateResponses });
  await rpc('anvil_reset');
  const replacement = await deploy();
  assert.equal(replacement.escrow.contractAddress, escrow);
  assert.notEqual(replacement.escrow.blockHash, manifest.deploymentHash);
  const reset = start(schema);
  await until('chain reset refused', async () => reset.child.exitCode !== null);
  assert.notEqual(reset.child.exitCode, 0);
  assert.equal(await events(), 14);
  record('scope, replay, code and chain-reset identity refusal', { oldDataPreserved: true });
  record('S2 and S3 local application acceptance', {
    result: 'pass',
    scope: 'Indexer and public HTTP pass locally; observed remote CI and full startup/demo remain separate',
  });
} catch (error) {
  console.error(error);
  writeFileSync(resolve(runtime, 'failure.txt'), String(error));
  process.exitCode = 1;
} finally {
  rpcAvailable = true;
  for (const child of children) await stop(child);
  if (proxy) await new Promise<void>((r) => proxy!.close(() => r()));
  await db?.end().catch(() => undefined);
  compose(['down', '--volumes', '--remove-orphans']);
  console.log(`Acceptance resources removed: ${project}`);
}
