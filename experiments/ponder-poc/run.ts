import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import pg from 'pg';
import { createPublicClient, createWalletClient, http, maxUint256 } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import { anvil } from 'viem/chains';
import { escrowEvents } from './abi.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const suffix = `${process.pid}-${randomBytes(4).toString('hex')}`;
const project = `remitee-poc-ponder-${suffix}`;
const runtime = resolve(root, '.local', project);
mkdirSync(runtime, { recursive: true });
const override = resolve(runtime, 'compose.yaml');
const manifestFile = resolve(runtime, 'deployment.json');
const faultFile = resolve(runtime, 'fault');
writeFileSync(override, 'services:\n  anvil:\n    ports: ["127.0.0.1:0:8545"]\n  postgres:\n    ports: ["127.0.0.1:0:5432"]\n');
const observations: { name: string; result: string; details: unknown }[] = [];
const children: ChildProcess[] = [];
let db: pg.Client | undefined;
let proxy: ReturnType<typeof createServer> | undefined;
let rpcAvailable = true;
let rejectedRequests = 0;
let sequence = 0;

function command(command: string, args: string[]) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 8_000_000 });
}
function compose(args: string[]) {
  return command('docker', ['compose', '--project-directory', root, '-f', resolve(root, 'compose.yaml'), '-f', override, '-p', project, ...args]);
}
function record(name: string, result: string, details: unknown) {
  const observation = { name, result, details };
  observations.push(observation);
  console.log(JSON.stringify(observation));
  writeFileSync(resolve(runtime, 'report.json'), JSON.stringify(observations, null, 2));
}
async function until(label: string, check: () => Promise<boolean>, timeout = 45_000) {
  const end = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < end) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    await delay(150);
  }
  throw new Error(`Timed out: ${label}`, { cause: lastError });
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  child.kill(signal);
  const timer = setTimeout(() => child.kill('SIGKILL'), 8_000);
  try { await done; } finally { clearTimeout(timer); }
}
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
function compile() {
  const config = JSON.parse(command('docker', ['compose', '-f', resolve(root, 'compose.yaml'), 'config', '--format', 'json']));
  const image = config.services.anvil.image as string;
  const name = `${project}-compile`;
  const script = 'mkdir -p /tmp/work; cp -R /source/src /source/test /source/lib /source/foundry.toml /source/remappings.txt /tmp/work/; cd /tmp/work; forge build';
  try {
    command('docker', ['create', '--name', name, '--entrypoint', 'sh', '--mount', `type=bind,source=${resolve(root, 'contracts')},target=/source,readonly`, image, '-c', script]);
    command('docker', ['start', '-a', name]);
    for (const contract of ['Escrow', 'MockERC20']) {
      command('docker', ['cp', `${name}:/tmp/work/out/${contract}.sol/${contract}.json`, resolve(runtime, `${contract}.json`)]);
    }
  } finally {
    command('docker', ['rm', '--force', '--volumes', name]);
  }
  const escrow = JSON.parse(readFileSync(resolve(runtime, 'Escrow.json'), 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  const token = JSON.parse(readFileSync(resolve(runtime, 'MockERC20.json'), 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  const eventShape = (event: any) => ({ name: event.name, type: event.type, anonymous: event.anonymous ?? false, inputs: event.inputs.map(({ name, type, indexed }: any) => ({ name, type, indexed: indexed ?? false })) });
  assert.deepEqual(escrowEvents.map(eventShape).sort((a, b) => a.name.localeCompare(b.name)), escrow.abi.filter(item => item.type === 'event').map(eventShape).sort((a, b) => a.name.localeCompare(b.name)));
  return { escrow, token };
}

console.log(`PoC resources: ${project}; evidence: ${runtime}`);
try {
  const artifacts = compile();
  compose(['up', '-d', '--wait', '--wait-timeout', '60', 'anvil', 'postgres']);
  const rpcUrl = `http://${compose(['port', 'anvil', '8545']).trim()}`;
  const databaseUrl = `postgres://remitee:remitee_local_only@${compose(['port', 'postgres', '5432']).trim()}/remitee`;
  db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  async function rpc(method: string, params: unknown[] = []) {
    const response = await fetch(rpcUrl, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000) });
    const body = await response.json() as { result: any; error?: unknown };
    assert(!body.error, `${method}: ${JSON.stringify(body.error)}`);
    return body.result;
  }
  proxy = createServer(async (request, response) => {
    if (!rpcAvailable) { rejectedRequests++; response.writeHead(503); response.end('PoC RPC outage'); return; }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const upstream = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks), signal: AbortSignal.timeout(5_000) });
      response.writeHead(upstream.status, { 'content-type': 'application/json' });
      response.end(await upstream.text());
    } catch { response.writeHead(502); response.end('PoC upstream unavailable'); }
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const proxyAddress = proxy.address();
  assert(proxyAddress && typeof proxyAddress !== 'string');
  const proxyUrl = `http://127.0.0.1:${proxyAddress.port}`;
  const client = createPublicClient({ chain: anvil, transport: http(rpcUrl, { retryCount: 0 }) });
  const accounts = await rpc('eth_accounts') as Address[];
  const sender = accounts[0]!;
  const beneficiary = accounts[1]!;
  const wallet = createWalletClient({ chain: anvil, account: sender, transport: http(rpcUrl) });
  const other = createWalletClient({ chain: anvil, account: beneficiary, transport: http(rpcUrl) });
  const receipt = (hash: Hex) => client.waitForTransactionReceipt({ hash, pollingInterval: 20 });
  async function deploy() {
    const deployment = await receipt(await wallet.deployContract({ abi: artifacts.escrow.abi, bytecode: artifacts.escrow.bytecode.object }));
    const escrow = deployment.contractAddress!;
    const tokenDeployment = await receipt(await wallet.deployContract({ abi: artifacts.token.abi, bytecode: artifacts.token.bytecode.object }));
    return { escrow, token: tokenDeployment.contractAddress!, deployment };
  }
  const deployment = await deploy();
  const { escrow, token } = deployment;
  writeFileSync(manifestFile, JSON.stringify({ address: escrow, deploymentBlock: Number(deployment.deployment.blockNumber), deploymentHash: deployment.deployment.blockHash, genesisHash: (await client.getBlock({ blockNumber: 0n })).hash }));
  const amount = 1n << 200n;
  await receipt(await wallet.writeContract({ address: token, abi: artifacts.token.abi, functionName: 'mint', args: [sender, amount + 100_000n] }));
  await receipt(await wallet.writeContract({ address: token, abi: artifacts.token.abi, functionName: 'approve', args: [escrow, maxUint256] }));
  const create = (value = 10n) => wallet.writeContract({ address: escrow, abi: artifacts.escrow.abi, functionName: 'createEscrow', args: [beneficiary, token, value] }).then(receipt);
  const act = (name: string, id: bigint, byBeneficiary = false) => (byBeneficiary ? other : wallet).writeContract({ address: escrow, abi: artifacts.escrow.abi, functionName: name, args: [id] }).then(receipt);
  for (let id = 1; id <= 5; id++) await create(id === 1 ? amount : 10n);
  await act('confirmEscrow', 1n, true);
  await act('cancelEscrow', 2n);
  await act('rejectEscrow', 3n, true);
  const fourth = await client.readContract({ address: escrow, abi: artifacts.escrow.abi, functionName: 'getEscrow', args: [4n] }) as { expiresAt: bigint };
  await rpc('evm_setNextBlockTimestamp', [Number(fourth.expiresAt)]);
  await act('recoverExpiredEscrow', 4n);

  const env = { ...process.env, DATABASE_URL: databaseUrl, POC_RPC_URL: proxyUrl, POC_MANIFEST: manifestFile, POC_FAULT_FILE: faultFile };
  const bin = resolve(here, 'node_modules/ponder', JSON.parse(readFileSync(resolve(here, 'node_modules/ponder/package.json'), 'utf8')).bin.ponder);
  function start(port: number, schema = 'probe', extraEnv: Record<string, string> = {}) {
    const log = resolve(runtime, `ponder-${sequence++}.log`);
    const output = createWriteStream(log);
    const child = spawn(process.execPath, [bin, 'start', '--schema', schema, '--hostname', '127.0.0.1', '--port', String(port), '--log-format', 'json'], { cwd: here, env: { ...env, ...extraEnv, POC_HTTP_ORIGIN: `http://127.0.0.1:${port}` }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.pipe(output); child.stderr!.pipe(output, { end: false });
    child.on('exit', () => output.end());
    children.push(child);
    return { child, log, url: `http://127.0.0.1:${port}` };
  }
  async function status(url: string) {
    try { return (await fetch(`${url}/ready`, { signal: AbortSignal.timeout(1_000) })).status; } catch { return null; }
  }
  async function graphql(url: string) {
    const response = await fetch(`${url}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ escrows(limit: 100) { items { id amount status } totalCount } }' }), signal: AbortSignal.timeout(3_000) });
    const body = await response.json() as { data?: { escrows: { items: { id: string; amount: string; status: string }[]; totalCount: number } }; errors?: unknown };
    assert(!body.errors, JSON.stringify(body.errors));
    return body.data!.escrows;
  }
  async function rows() { return (await db!.query('SELECT * FROM probe.escrows ORDER BY id')).rows; }
  async function count(table: 'escrows' | 'journal') { return (await db!.query(`SELECT count(*)::int AS n FROM probe.${table}`)).rows[0].n as number; }
  const port = await freePort();
  let running = start(port);
  await until('initial backfill ready', async () => (await status(running.url)) === 200 && (await count('escrows')) === 5 && (await count('journal')) === 9 && (await rows()).find(row => row.id === '4')?.status === 'Expired');
  const initial = await rows();
  assert.deepEqual(initial.map(row => row.status), ['Released', 'CancelledBySender', 'Rejected', 'Expired', 'Pending']);
  assert.equal(initial[0].amount, amount.toString());
  assert.equal(initial[0].sender, sender.toLowerCase());
  assert.equal(initial[0].beneficiary, beneficiary.toLowerCase());
  assert.equal(initial[0].token, token.toLowerCase());
  const first = await client.readContract({ address: escrow, abi: artifacts.escrow.abi, functionName: 'getEscrow', args: [1n] }) as { createdAt: bigint; cancelDeadline: bigint; expiresAt: bigint };
  assert.equal(initial[0].created_at, first.createdAt.toString());
  assert.equal(initial[0].cancel_deadline, first.cancelDeadline.toString());
  assert.equal(initial[0].expires_at, first.expiresAt.toString());
  assert.equal(await count('journal'), 9);
  const initialApi = await graphql(running.url);
  assert.equal(initialApi.totalCount, 5);
  assert.equal(initialApi.items.find(row => row.id === '1')?.amount, amount.toString());
  record('P1 history and exact uint256', 'pass', { escrows: 5, events: 9, amount: amount.toString(), statuses: initial.map(row => row.status) });

  await create();
  await until('live creation 6', async () => (await count('escrows')) === 6);
  await stop(running.child);
  await create(); // Missed while the indexer is offline.
  running = start(port);
  await until('restart catch-up', async () => (await status(running.url)) === 200 && (await count('escrows')) === 7, 90_000);
  assert.equal(await count('journal'), 11);
  record('P2 same-build restart and catch-up', 'pass', { escrows: 7, events: 11 });

  writeFileSync(faultFile, '8');
  await create();
  await until('handler interruption barrier', async () => existsSync(`${faultFile}.reached`));
  await delay(1_200);
  const partial = (await db.query('SELECT (SELECT count(*)::int FROM probe.journal WHERE escrow_id = 8) AS events, (SELECT count(*)::int FROM probe.escrows WHERE id = 8) AS escrows')).rows[0];
  assert.equal(partial.events, partial.escrows, 'Journal/projection must not be partially committed');
  await stop(running.child, 'SIGKILL');
  rmSync(faultFile);
  running = start(port);
  await until('hard-kill recovery', async () => (await status(running.url)) === 200 && (await count('escrows')) === 8, 90_000);
  assert.equal(await count('journal'), 12);
  record('P3 kill after journal, before projection', 'pass', { duringHandler: partial, recoveredEscrows: 8, recoveredEvents: 12 });

  const competing = start(await freePort());
  await until('second writer excluded', async () => competing.child.exitCode !== null || /locked|lock on|in use|another instance/i.test(readFileSync(competing.log, 'utf8')), 20_000);
  assert.notEqual(await status(competing.url), 200);
  assert.equal(await count('journal'), 12);
  await stop(competing.child);
  record('P4 competing writer', 'pass', { secondReady: false, journalUnchanged: true });

  const ninth = await create();
  await until('native latest-head admission', async () => (await count('escrows')) === 9);
  const observedHead = await client.getBlockNumber({ cacheTime: 0 });
  const extraBlocks = observedHead - ninth.blockNumber;
  const admittedApi = await graphql(running.url);
  const publiclyVisible = admittedApi.items.some(row => row.id === '9');
  record('P6 additional-block admission', extraBlocks < 2n && publiclyVisible ? 'integration-gap' : 'pass', { extraBlocksAtVisibility: extraBlocks.toString(), publiclyVisible, proposedDelay: 2 });
  rpcAvailable = false;
  await until('worker observes RPC outage', async () => rejectedRequests > 0);
  await delay(2_500);
  const outageReady = await status(running.url);
  record('P6 RPC outage readiness', outageReady === 200 ? 'integration-gap' : 'pass', { nativeReadyStatus: outageReady, rejectedRequests });
  rpcAvailable = true;
  await create(); // id 10, also proves resumed RPC observation.
  await until('RPC recovery', async () => (await count('escrows')) === 10);

  const snapshot = await rpc('evm_snapshot');
  const released = await act('confirmEscrow', 10n, true);
  await until('release before fork', async () => (await rows()).find(row => row.id === '10')?.status === 'Released');
  assert.equal(await rpc('evm_revert', [snapshot]), true);
  const ancestor = await client.getBlock();
  await rpc('evm_setNextBlockTimestamp', [Number(ancestor.timestamp + 3n)]);
  const rejected = await act('rejectEscrow', 10n, true);
  assert.equal(rejected.blockNumber, released.blockNumber);
  assert.notEqual(rejected.blockHash, released.blockHash);
  await rpc('anvil_mine', [1]);
  await until('same-height fork reconciliation', async () => (await rows()).find(row => row.id === '10')?.status === 'Rejected');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM probe.journal WHERE transaction_hash = $1', [released.transactionHash])).rows[0].n, 0);
  assert.equal(await count('journal'), 15);
  record('P5 shallow fork', 'pass', { replacedBlock: rejected.blockNumber.toString(), orphanReleaseRemoved: true, finalStatus: 'Rejected' });

  await stop(running.child);
  await rpc('anvil_reset');
  const replacement = await deploy();
  assert.equal(replacement.escrow, escrow);
  assert.equal(replacement.deployment.blockNumber, deployment.deployment.blockNumber);
  assert.notEqual(replacement.deployment.blockHash, deployment.deployment.blockHash);
  await receipt(await wallet.writeContract({ address: replacement.token, abi: artifacts.token.abi, functionName: 'mint', args: [sender, 777n] }));
  await receipt(await wallet.writeContract({ address: replacement.token, abi: artifacts.token.abi, functionName: 'approve', args: [escrow, maxUint256] }));
  await create(777n);
  running = start(port);
  await until('reset restart outcome', async () => running.child.exitCode !== null || (await status(running.url)) === 200, 90_000);
  const resetReady = await status(running.url);
  const resetRows = await rows();
  const resetCorrect = resetRows.length === 1 && resetRows[0].id === '1' && resetRows[0].amount === '777' && resetRows[0].status === 'Pending';
  record('P5 same-address chain reset', resetReady === 200 && !resetCorrect ? 'incompatible' : 'pass', { readyStatus: resetReady, rowCount: resetRows.length, replacementCorrect: resetCorrect, exitCode: running.child.exitCode });
  await stop(running.child);
  // Isolated second profile: preserve admission and fail-closed reads using only
  // a delayed RPC transport and an HTTP guard; Ponder still owns all persistence.
  writeFileSync(manifestFile, JSON.stringify({ address: escrow, deploymentBlock: Number(replacement.deployment.blockNumber), deploymentHash: replacement.deployment.blockHash, genesisHash: (await client.getBlock({ blockNumber: 0n })).hash }));
  const guardedEnv = { POC_MODE: 'guarded', POC_CONFIRMATION_DELAY: '2' };
  running = start(port, 'guarded', guardedEnv);
  await until('guarded profile ready', async () => (await status(running.url)) === 200);
  async function guardedRows() { return (await db!.query('SELECT * FROM guarded.escrows ORDER BY id')).rows; }
  await delay(1_200);
  assert.equal((await guardedRows()).length, 0);
  assert.equal((await graphql(running.url)).totalCount, 0);
  await rpc('anvil_mine', [1]);
  await delay(1_200);
  assert.equal((await guardedRows()).length, 0);
  await rpc('anvil_mine', [1]);
  await until('admission after exactly two blocks', async () => (await guardedRows()).length === 1);
  assert.equal((await graphql(running.url)).items[0].amount, '777');
  record('G1 delayed transport admission', 'pass', { extraBlocks: [0, 1, 2], visible: [false, false, true], amount: '777' });
  rpcAvailable = false;
  await until('guarded RPC outage', async () => {
    try { return (await fetch(`${running.url}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ escrows { totalCount } }' }), signal: AbortSignal.timeout(3_000) })).status === 503; } catch { return false; }
  });
  record('G2 public read during outage', 'pass', { graphqlStatus: 503 });
  rpcAvailable = true;
  await until('guarded RPC restored', async () => (await graphql(running.url)).totalCount === 1);

  const provisionalSnapshot = await rpc('evm_snapshot');
  const provisionalReject = await act('rejectEscrow', 1n, true);
  await delay(1_200);
  assert.equal((await guardedRows())[0].status, 'Pending');
  rpcAvailable = false; // Hide transient height regressions while replacing history.
  assert.equal(await rpc('evm_revert', [provisionalSnapshot]), true);
  const guardedSnapshot = await rpc('evm_snapshot');
  const releaseAncestor = await client.getBlock();
  await rpc('evm_setNextBlockTimestamp', [Number(releaseAncestor.timestamp + 3n)]);
  const guardedRelease = await act('confirmEscrow', 1n, true);
  await rpc('anvil_mine', [2]);
  rpcAvailable = true;
  await until('guarded release admitted', async () => (await guardedRows())[0].status === 'Released');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM guarded.journal WHERE transaction_hash = $1', [provisionalReject.transactionHash])).rows[0].n, 0);
  record('G3 pre-admission fork', 'pass', { provisionalOutcomeNeverProjected: true, canonicalOutcome: 'Released' });

  rpcAvailable = false;
  assert.equal(await rpc('evm_revert', [guardedSnapshot]), true);
  const beforeRejection = await client.getBlock();
  await rpc('evm_setNextBlockTimestamp', [Number(beforeRejection.timestamp + 5n)]);
  const guardedRejection = await act('rejectEscrow', 1n, true);
  assert.equal(guardedRejection.blockNumber, guardedRelease.blockNumber);
  assert.notEqual(guardedRejection.blockHash, guardedRelease.blockHash);
  await rpc('anvil_mine', [2]);
  rpcAvailable = true;
  await until('guarded admitted reorg detected', async () => /Encountered unrecoverable reorg/.test(readFileSync(running.log, 'utf8')), 30_000);
  const canonicalRecord = await client.readContract({ address: escrow, abi: artifacts.escrow.abi, functionName: 'getEscrow', args: [1n] }) as { status: number };
  assert.equal(canonicalRecord.status, 3); // Rejected in the compiled enum.
  const reorgReady = await status(running.url);
  let reorgHttp: number | null = null;
  let publicOutcome: string | null = null;
  try {
    const response = await fetch(`${running.url}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ escrows { items { id status } } }' }), signal: AbortSignal.timeout(3_000) });
    reorgHttp = response.status;
    const body = await response.json() as { data?: { escrows?: { items: { id: string; status: string }[] } } };
    publicOutcome = body.data?.escrows?.items.find(row => row.id === '1')?.status ?? null;
  } catch { /* A stopped server is an acceptable fail-closed result. */ }
  record('G4 admitted mismatch and public reads', publicOutcome === 'Released' ? 'incompatible' : 'pass', { nativeReady: reorgReady, graphqlHttp: reorgHttp, publicOutcome, canonicalOutcome: 'Rejected', verifiedSameHeightDifferentHash: true });
  await stop(running.child);

  running = start(port, 'validated_replay', guardedEnv);
  await until('explicit canonical replay', async () => (await status(running.url)) === 200 && (await db!.query('SELECT status FROM validated_replay.escrows WHERE id = 1')).rows[0]?.status === 'Rejected');
  const replayJournal = (await db.query('SELECT count(*)::int AS n FROM validated_replay.journal')).rows[0].n;
  assert.equal(replayJournal, 2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM validated_replay.journal WHERE transaction_hash = $1', [guardedRelease.transactionHash])).rows[0].n, 0);
  record('G5 validated replay', 'pass', { status: 'Rejected', events: 2, orphanAbsent: true });
  const gaps = observations.filter(row => row.result !== 'pass');
  record('Decision inputs', gaps.some(row => row.result === 'incompatible') ? 'retain-rpc-polling' : 'ponder-compatible-with-adapter', { nativeGaps: gaps.map(row => row.name), adapter: 'delayed read transport + identity/readiness guard; no second cursor or writer', scope: 'PoC only; not full AC6-AC8 evidence' });
} catch (error) {
  record('Experiment failure', 'failed', { message: error instanceof Error ? error.message : String(error), cause: error instanceof Error ? String(error.cause ?? '') : '' });
  console.error(error);
  process.exitCode = 1;
} finally {
  rpcAvailable = true;
  for (const child of children) await stop(child);
  if (proxy) await new Promise<void>(resolve => proxy!.close(() => resolve()));
  await db?.end().catch(() => undefined);
  assert(project.startsWith('remitee-poc-ponder-'));
  compose(['down', '--volumes', '--remove-orphans']);
  console.log(`PoC resources removed. Local evidence retained at ${runtime}`);
}
