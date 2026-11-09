import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = process.env.REMITEE_APP_TEST_PROJECT ?? `remitee-app-check-${process.pid}-${randomBytes(4).toString('hex')}`;
assert.match(project, /^remitee-app-check-[a-z0-9-]+$/);
const runtime = resolve(root, '.local', project);
mkdirSync(runtime, { recursive: true });
const env = { ...process.env, API_PORT: '0', INDEXER_SCHEMA: 'escrow_index', CONFIRMATION_DELAY: process.env.REMITEE_APP_TEST_DELAY ?? '2', REORG_WINDOW_SECONDS: '180', INDEXER_POLL_MS: '200' };
const report: { name: string; details: unknown }[] = [];
function record(name: string, details: unknown = {}) {
  report.push({ name, details });
  writeFileSync(resolve(runtime, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: name }));
}
function docker(args: string[], allowFailure = false, timeout = 180_000) {
  const result = spawnSync('docker', args, { cwd: root, env, encoding: 'utf8', timeout, maxBuffer: 12_000_000 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`Docker command failed (${result.status}): ${result.stderr}\n${result.stdout}`);
  return result;
}
const compose = (args: string[], allowFailure = false, timeout = 180_000) =>
  docker(['compose', '--project-directory', root, '-f', 'compose.yaml', '-p', project, '--profile', 'app', ...args], allowFailure, timeout);
const execNode = (source: string) => compose(['exec', '-T', 'application', 'node', '--input-type=module', '-e', source]).stdout.trim();
let base = '';
function locateApi() {
  const port = compose(['port', 'application', '3000']).stdout.trim();
  assert.match(port, /^127\.0\.0\.1:\d+$/);
  base = `http://${port}`;
}
async function request(path: string) {
  // Synchronous Docker commands block this driver's event loop between reads.
  // Do not reuse a socket whose idle-close event could be waiting to run.
  const response = await fetch(`${base}${path}`, { headers: { connection: 'close' }, signal: AbortSignal.timeout(8_000) });
  return { status: response.status, body: await response.json() as any };
}
async function ready() {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    try { if ((await request('/health')).status === 200) return; } catch {}
    await delay(300);
  }
  throw new Error('Public Docker application did not become ready');
}
function nonce(address: string) {
  return execNode(`const r=await fetch('http://anvil:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionCount',params:[${JSON.stringify(address)},'latest']})});console.log((await r.json()).result);`);
}
let failed = false;
try {
  console.log(`Docker application acceptance: ${project}`);
  compose(['up', '--build', '--wait', '--wait-timeout', '120'], false, 600_000);
  locateApi();
  await ready();
  const specification = await fetch(`${base}/openapi.yaml`, { headers: { connection: 'close' } });
  assert.equal(specification.status, 200);
  assert.equal(await specification.text(), readFileSync(resolve(root, 'docs/api/openapi.yaml'), 'utf8'));
  const execution = JSON.parse(execNode(`import {existsSync,readFileSync} from 'node:fs';console.log(JSON.stringify({uid:process.getuid(),node:process.version,npm:JSON.parse(readFileSync('/usr/local/lib/node_modules/npm/package.json')).version,socket:existsSync('/var/run/docker.sock'),environmentFile:existsSync('/app/.env'),descriptor:JSON.parse(readFileSync('/state/deployment.json'))}));`));
  assert.equal(execution.uid, 1000);
  assert.equal(execution.node, 'v24.14.1');
  assert.equal(execution.npm, '11.11.0');
  assert.equal(execution.socket, false);
  assert.equal(execution.environmentFile, false);
  const container = compose(['ps', '-q', 'application']).stdout.trim();
  const inspection = JSON.parse(docker(['inspect', container]).stdout)[0];
  assert.ok(inspection.Mounts.every((mount: { Type: string; RW: boolean }) => mount.Type === 'volume' && !mount.RW));
  assert.deepEqual(Object.keys(inspection.HostConfig.PortBindings), ['3000/tcp']);
  const contents = JSON.parse(docker(['run', '--rm', '--entrypoint', 'node', inspection.Config.Image, '--input-type=module', '-e', `import {existsSync,readdirSync} from 'node:fs';console.log(JSON.stringify({forbidden:['/app/.env','/app/apps/indexer/.env','/app/apps/indexer/.ponder','/app/apps/indexer/test','/app/apps/indexer/ponder-env.d.ts','/app/contracts'].filter(existsSync),scripts:readdirSync('/app/scripts').sort()}));`]).stdout);
  assert.deepEqual(contents.forbidden, []);
  assert.deepEqual(contents.scripts, ['build-artifacts.ts', 'demo.ts', 'deploy-local.ts', 'deployment-manifest.ts', 'indexer.ts', 'read-api.ts']);
  for (const service of ['anvil', 'postgres']) {
    const id = compose(['ps', '-q', service]).stdout.trim();
    assert.equal(Object.keys(JSON.parse(docker(['inspect', id]).stdout)[0].HostConfig.PortBindings ?? {}).length, 0);
  }
  record('one-command Docker startup, real health/OpenAPI and non-root socket-free runtime', { node: execution.node, api: base });

  const runDemo = () => {
    const result = compose(['run', '--rm', '--no-deps', 'demo']);
    writeFileSync(resolve(runtime, `demo-${report.length}.json`), result.stdout);
    const data = JSON.parse(result.stdout);
    assert.equal(data.result, 'pass');
    assert.equal(data.confirmationDelay, Number(env.CONFIRMATION_DELAY));
    assert.equal(data.observation.confirmationDelay, Number(env.CONFIRMATION_DELAY));
    assert.equal(data.observation.headLag, env.CONFIRMATION_DELAY);
    assert.equal(data.observation.eligibleBacklog, '0');
    assert.equal(data.onChainVerified, true);
    assert.equal(data.payouts.length, 4);
    assert.deepEqual(data.outcomes.map((outcome: any) => outcome.onChainStatus), ['CancelledBySender', 'Released', 'Rejected', 'Expired']);
    return data;
  };
  const first = runDemo();
  record('containerized four-outcome demo, recoverable expiry, balances and admitted HTTP traces', first);
  const second = runDemo();
  assert.ok(second.outcomes.every((outcome: any) => !first.outcomes.some((old: any) => old.id === outcome.id)));
  record('repeat demo uses new receipt-derived IDs and preserves previous terminal outcomes');
  const nonceBefore = nonce(first.sender);
  const wrongDemo = compose(['run', '--rm', '--no-deps', '-e', `CONFIRMATION_DELAY=${Number(env.CONFIRMATION_DELAY) + 1}`, 'demo'], true);
  assert.equal(wrongDemo.status, 1);
  assert.match(wrongDemo.stderr, /Demo CONFIRMATION_DELAY does not match running application/);
  assert.equal(nonce(first.sender), nonceBefore);
  assert.equal((await request('/health')).status, 200);
  record('mismatched demo policy refuses before any transaction without reconciling the active application');
  compose(['up', '--wait', '--wait-timeout', '90']);
  locateApi();
  await ready();
  assert.equal(nonce(first.sender), nonceBefore);
  assert.deepEqual(JSON.parse(execNode(`import {readFileSync} from 'node:fs';console.log(readFileSync('/state/deployment.json','utf8'));`)), execution.descriptor);
  record('repeated startup reuses validated deployment without another transaction');

  compose(['restart', 'application']);
  locateApi();
  await ready();
  for (const outcome of first.outcomes) {
    const detail = await request(`/escrows/${outcome.id}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.escrow, outcome);
  }
  assert.equal(nonce(first.sender), nonceBefore);
  record('application-only restart preserves all original outcomes and transaction hashes');

  compose(['stop', 'postgres']);
  const unhealthy = await request('/health');
  assert.equal(unhealthy.status, 503);
  assert.equal(unhealthy.body.reason, 'database_unavailable');
  const unavailable = await request(`/escrows/${first.outcomes[0].id}`);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.error.reason, 'database_unavailable');
  assert.equal((await fetch(`${base}/openapi.yaml`, { headers: { connection: 'close' } })).status, 200);
  compose(['up', '-d', '--wait', 'postgres']);
  await ready();
  record('database outage refuses data, retains raw specification and recovers');

  const wrongBuild = compose(['run', '--rm', '--no-deps', 'deploy', 'node', '--input-type=module', '-e', `import {readFileSync,writeFileSync} from 'node:fs';const p='/app/artifacts/Escrow.json';const a=JSON.parse(readFileSync(p));a.deployedBytecode.object='0x00';writeFileSync(p,JSON.stringify(a));process.argv.push('--compose');await import('./scripts/deploy-local.ts');`], true);
  assert.equal(wrongBuild.status, 1);
  assert.match(wrongBuild.stderr, /Packaged build differs/);
  assert.equal(nonce(first.sender), nonceBefore);
  record('changed packaged build refuses reuse without a new transaction');

  const incompatible = compose(['run', '--rm', '--no-deps', '-e', `CONFIRMATION_DELAY=${Number(env.CONFIRMATION_DELAY) + 1}`, 'application'], true, 30_000);
  assert.equal(incompatible.status, 1);
  assert.match(incompatible.stderr, /persisted_scope_mismatch/);
  assert.equal((await request('/health')).status, 200);
  record('changed persisted admission policy refuses a second application');

  const count = () => compose(['exec', '-T', 'postgres', 'psql', '-U', 'remitee', '-d', 'remitee', '-Atc', 'SELECT count(*) FROM escrow_index.escrows']).stdout.trim();
  const recordsBefore = count();
  assert.equal(recordsBefore, '8');
  compose(['stop', 'application']);
  compose(['restart', 'anvil']);
  compose(['up', '-d', '--wait', 'anvil']);
  const refused = compose(['run', '--rm', '--no-deps', 'deploy'], true);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /deployment_identity_mismatch/);
  assert.equal(count(), recordsBefore);
  record('lost disposable chain refuses old descriptor/database reuse and preserves all rows');
} catch (error) {
  failed = true;
  console.error(error);
  const logs = compose(['logs', '--no-color', '--tail', '60'], true);
  writeFileSync(resolve(runtime, 'failure.log'), logs.stdout + logs.stderr);
  throw error;
} finally {
  try {
    compose(['down', '--volumes', '--remove-orphans']);
    for (const resource of [['ps', '--all'], ['network', 'ls'], ['volume', 'ls']]) {
      assert.equal(docker([...resource, '--quiet', '--filter', `label=com.docker.compose.project=${project}`]).stdout.trim(), '');
    }
    console.log(`Removed only acceptance resources: ${project}`);
  } catch (error) { if (!failed) throw error; console.error('Acceptance cleanup failed:', error); }
}
