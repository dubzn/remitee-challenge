import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.local/contracts-docs');
function docker(args: string[]) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 8_000_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || `docker ${args[0]} failed (${result.status})`);
  return result.stdout;
}
const config = JSON.parse(
  docker(['compose', '-f', 'compose.yaml', 'config', '--format', 'json']),
) as {
  services: { anvil: { image: string } };
};
const image = config.services.anvil.image;
assert.match(image, /^ghcr\.io\/foundry-rs\/foundry:.*@sha256:[a-f0-9]{64}$/);
const container = `remitee-contract-docs-${process.pid}-${randomBytes(4).toString('hex')}`;
let failed = false;
try {
  docker([
    'create',
    '--name',
    container,
    '--entrypoint',
    '/bin/sh',
    '--mount',
    `type=bind,source=${resolve(root, 'contracts')},target=/source,readonly`,
    image,
    '-c',
    `set -eu
mkdir /tmp/contracts
cp -R /source/src /source/lib /tmp/contracts/
cp /source/foundry.toml /source/remappings.txt /source/book.toml /source/README.md /tmp/contracts/
cd /tmp/contracts
forge doc --out /tmp/generated --build
for contract in IEscrow Escrow; do
  forge inspect "$contract" userdoc --json > "/tmp/generated/$contract.userdoc.json"
  forge inspect "$contract" devdoc --json > "/tmp/generated/$contract.devdoc.json"
done`,
  ]);
  console.log(docker(['start', '-a', container]).trim());
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  // Copy only generated artifacts; the source mount is read-only and no service is touched.
  docker(['cp', `${container}:/tmp/generated/.`, output]);
} catch (error) {
  failed = true;
  throw error;
} finally {
  try {
    docker(['rm', '--force', '--volumes', container]);
  } catch (error) {
    if (!failed) {
      // biome-ignore lint/correctness/noUnsafeFinally: No primary failure is pending; report the cleanup failure.
      throw error;
    }
    console.error('Documentation container cleanup failed:', error);
  }
}

type Entry = {
  notice?: string;
  details?: string;
  params?: Record<string, string>;
  returns?: Record<string, string>;
};
type NatSpec = {
  methods: Record<string, Entry>;
  events?: Record<string, Entry>;
  errors?: Record<string, Entry[]>;
};
const doc = (contract: string, kind: string) =>
  JSON.parse(readFileSync(join(output, `${contract}.${kind}.json`), 'utf8')) as NatSpec;
const baseUser = doc('IEscrow', 'userdoc');
const baseDev = doc('IEscrow', 'devdoc');
const user = doc('Escrow', 'userdoc');
const dev = doc('Escrow', 'devdoc');
const methods = [
  'CANCELLATION_WINDOW()',
  'ESCROW_TTL()',
  'cancelEscrow(uint256)',
  'confirmEscrow(uint256)',
  'createEscrow(address,address,uint256)',
  'getEscrow(uint256)',
  'recoverExpiredEscrow(uint256)',
  'rejectEscrow(uint256)',
];
const parameterCount = (signature: string) =>
  signature.endsWith('()') ? 0 : signature.split('(')[1]!.split(',').length;
assert.deepEqual(Object.keys(baseUser.methods).sort(), methods.toSorted());
for (const signature of methods) {
  assert.ok(baseUser.methods[signature]?.notice, `Missing notice: ${signature}`);
  assert.equal(
    Object.keys(baseDev.methods[signature]?.params ?? {}).length,
    parameterCount(signature),
    `Undocumented method parameter: ${signature}`,
  );
  assert.deepEqual(
    user.methods[signature],
    baseUser.methods[signature],
    `Lost userdoc inheritance: ${signature}`,
  );
  // solc 0.8.30 inherits getter notices, but does not emit interface @return
  // devdoc for an automatically generated constant getter. Keep that explicit.
  if (signature.endsWith('()')) {
    assert.ok(
      baseDev.methods[signature]?.returns?._0,
      `Missing interface getter return: ${signature}`,
    );
    assert.equal(dev.methods[signature], undefined);
  } else {
    assert.deepEqual(
      dev.methods[signature],
      baseDev.methods[signature],
      `Lost devdoc inheritance: ${signature}`,
    );
  }
}
for (const [signature, entry] of Object.entries(baseUser.events ?? {})) {
  assert.ok(entry.notice, `Missing event notice: ${signature}`);
  assert.deepEqual(user.events?.[signature], entry, `Lost event inheritance: ${signature}`);
  assert.equal(
    Object.keys(baseDev.events?.[signature]?.params ?? {}).length,
    parameterCount(signature),
    `Undocumented event parameter: ${signature}`,
  );
  assert.deepEqual(
    dev.events?.[signature],
    baseDev.events?.[signature],
    `Lost event devdoc: ${signature}`,
  );
}
assert.equal(Object.keys(baseUser.events ?? {}).length, 5);
for (const [signature, entries] of Object.entries(baseUser.errors ?? {})) {
  assert.ok(
    entries.every((entry) => entry.notice),
    `Missing error notice: ${signature}`,
  );
  assert.deepEqual(user.errors?.[signature], entries, `Lost error inheritance: ${signature}`);
  assert.equal(
    Object.keys(baseDev.errors?.[signature]?.[0]?.params ?? {}).length,
    parameterCount(signature),
    `Undocumented error parameter: ${signature}`,
  );
  assert.deepEqual(
    dev.errors?.[signature],
    baseDev.errors?.[signature],
    `Lost error devdoc: ${signature}`,
  );
}
assert.equal(Object.keys(baseUser.errors ?? {}).length, 10);

const interfacePage = readFileSync(
  join(output, 'src/src/IEscrow.sol/interface.IEscrow.md'),
  'utf8',
);
const implementationPage = readFileSync(
  join(output, 'src/src/Escrow.sol/contract.Escrow.md'),
  'utf8',
);
assert.ok(
  implementationPage.includes('[IEscrow](/src/IEscrow.sol/interface.IEscrow.md)'),
  'Missing inherited-interface navigation',
);
assert.ok(implementationPage.includes('CANCELLATION_WINDOW = 2 hours'));
assert.ok(implementationPage.includes('ESCROW_TTL = 7 days'));
for (const signature of methods) {
  for (const page of [interfacePage, implementationPage]) {
    assert.ok(
      page.includes(baseUser.methods[signature]!.notice!),
      `Rendered notice missing: ${signature}`,
    );
    const details = baseDev.methods[signature]?.details;
    if (details)
      assert.ok(
        page.replace(/\s+/g, ' ').includes(details),
        `Rendered devdoc missing: ${signature}`,
      );
  }
}
for (const name of [
  'EscrowCreated',
  'EscrowCancelled',
  'EscrowReleased',
  'EscrowRejected',
  'EscrowExpired',
  ...Object.keys(baseUser.errors ?? {}).map((signature) => signature.split('(')[0]),
  'EscrowRecord',
  'Status',
]) {
  assert.ok(interfacePage.includes(`### ${name}`), `Reference entry missing: ${name}`);
}

const book = join(output, 'book');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const htmlFiles = files(book).filter((file) => file.endsWith('.html'));
assert.ok(htmlFiles.length >= 3, 'Missing rendered reference pages');
let localTargets = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  assert.doesNotMatch(
    html,
    /<script[^>]+src=["'][^"']*mathjax/i,
    'Unneeded MathJax runtime dependency',
  );
  for (const match of html.matchAll(
    /<(a|link|script|img|source|iframe)\b[^>]*?\b(href|src)=["']([^"']*)["']/gi,
  )) {
    const [, tag, , target] = match;
    if (!target) continue;
    if (/^(?:https?:)?\/\//i.test(target)) {
      assert.equal(tag!.toLowerCase(), 'a', `External runtime resource: ${target}`);
      continue;
    }
    if (/^(?:data:|mailto:)/i.test(target)) continue;
    const [pathname] = target.split(/[?#]/);
    if (!pathname) continue;
    const local = pathname.startsWith('/')
      ? resolve(book, `.${decodeURIComponent(pathname)}`)
      : resolve(dirname(file), decodeURIComponent(pathname));
    assert.ok(local.startsWith(`${book}/`), `Reference escapes book: ${target}`);
    assert.ok(existsSync(local), `Missing local target in ${file}: ${target}`);
    localTargets++;
  }
}
for (const file of files(book).filter((file) => file.endsWith('.css'))) {
  assert.doesNotMatch(
    readFileSync(file, 'utf8'),
    /(?:url\(\s*["']?|@import\s*["'])(?:https?:)?\/\//i,
  );
}
console.log(
  `PASS inherited NatSpec for ${methods.length} methods, 5 events and 10 custom errors; rendered Markdown/HTML and ${localTargets} local targets across ${htmlFiles.length} pages`,
);
console.log(`Generated reference: ${output}/book/index.html`);
