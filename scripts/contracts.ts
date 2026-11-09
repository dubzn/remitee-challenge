import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = spawnSync(
  'docker',
  ['compose', '-f', 'compose.yaml', 'config', '--format', 'json'],
  {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  },
);
if (config.error) throw config.error;
if (config.status !== 0) throw new Error(config.stderr || 'Could not read pinned Foundry image');
const image = (JSON.parse(config.stdout) as { services: { anvil: { image: string } } }).services
  .anvil.image;
assert.match(image, /^ghcr\.io\/foundry-rs\/foundry:.*@sha256:[a-f0-9]{64}$/);

// Read-only source mount; compilation and the in-process test EVM stay in /tmp.
// No Anvil, DB, Docker socket mount, host build writes or wallet keys are needed.
const script = `
set -eu
mkdir /tmp/contracts
cp -R /source/src /source/test /source/lib /tmp/contracts/
cp /source/foundry.toml /source/remappings.txt /tmp/contracts/
cd /tmp/contracts
forge fmt --check src test >&2
forge build >&2
printf '{"tests":'
forge test --json
printf ',"abi":'
forge inspect Escrow abi --json
printf '}\n'
`;
const container = `remitee-contract-check-${process.pid}-${randomBytes(4).toString('hex')}`;
let output: string;
let failed = false;
try {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--name',
      container,
      '--entrypoint',
      '/bin/sh',
      '--mount',
      `type=bind,source=${resolve(root, 'contracts')},target=/source,readonly`,
      image,
      '-c',
      script,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      timeout: 300_000,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(result.stdout);
    throw new Error(`Contract format/build/test checks failed (${result.status})`);
  }
  output = result.stdout;
} catch (error) {
  failed = true;
  throw error;
} finally {
  const cleanup = spawnSync('docker', ['rm', '--force', '--volumes', container], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (cleanup.status !== 0 && !cleanup.stderr?.includes('No such container')) {
    console.error('Contract check cleanup failed:', cleanup.error ?? cleanup.stderr);
    if (!failed) {
      // biome-ignore lint/correctness/noUnsafeFinally: No primary failure is pending; report the cleanup failure.
      throw new Error('Contract check cleanup failed');
    }
  }
}

type TestResult = { status: string; reason?: string | null };
type AbiEntry = {
  type: string;
  name?: string;
  stateMutability?: string;
  inputs?: { type: string; indexed?: boolean }[];
};
const report = JSON.parse(output) as {
  tests: Record<string, { test_results: Record<string, TestResult> }>;
  abi: AbiEntry[];
};
const tests = Object.entries(report.tests).flatMap(([suite, value]) =>
  Object.entries(value.test_results).map(([test, result]) => ({ suite, test, ...result })),
);
assert.ok(tests.length > 0, 'An empty Foundry suite cannot pass contract acceptance');
for (const suite of [
  'test/Escrow.t.sol:EscrowTest',
  'test/EscrowAdversarial.t.sol:EscrowAdversarialTokenTest',
  'test/EscrowAdversarial.t.sol:EscrowAdversarialReentrancyTest',
])
  assert.ok(
    Object.keys(report.tests[suite]?.test_results ?? {}).length > 0,
    `Missing required suite: ${suite}`,
  );
for (const test of tests)
  assert.equal(test.status, 'Success', `${test.suite}/${test.test}: ${test.reason}`);
const writes = report.abi.filter(
  (x) => x.type === 'function' && !['view', 'pure'].includes(x.stateMutability ?? ''),
);
assert.deepEqual(
  writes.map((x) => `${x.name}(${x.inputs?.map((input) => input.type).join(',')})`).sort(),
  [
    'cancelEscrow(uint256)',
    'confirmEscrow(uint256)',
    'createEscrow(address,address,uint256)',
    'recoverExpiredEscrow(uint256)',
    'rejectEscrow(uint256)',
  ],
);
assert.ok(
  !report.abi.some((x) => x.type === 'fallback' || x.type === 'receive'),
  'Unexpected fallback/receive entry',
);
for (const entry of writes) assert.equal(entry.stateMutability, 'nonpayable');
const created = report.abi.find((x) => x.type === 'event' && x.name === 'EscrowCreated');
assert.deepEqual(
  created?.inputs?.map((x) => x.type),
  ['uint256', 'address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
);
assert.deepEqual(
  created?.inputs?.map((x) => Boolean(x.indexed)),
  [true, true, true, false, false, false, false, false],
);
assert.deepEqual(
  report.abi
    .filter((x) => x.type === 'event')
    .map((x) => x.name)
    .sort(),
  ['EscrowCancelled', 'EscrowCreated', 'EscrowExpired', 'EscrowRejected', 'EscrowReleased'],
);
console.log(
  `PASS ${tests.length} contract tests across ${Object.keys(report.tests).length} suites; format/build and compiled ABI checks passed`,
);
