import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Abi, Hex } from 'viem';
import { escrowEvents } from '../apps/indexer/abi.ts';
export type Artifact = { abi: Abi; bytecode: { object: Hex }; deployedBytecode: { object: Hex } };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function compileArtifacts(output: string) {
  mkdirSync(output, { recursive: true });
  const command = (args: string[]) =>
    execFileSync('docker', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 8_000_000,
    });
  const config = JSON.parse(
    command(['compose', '-f', 'compose.yaml', 'config', '--format', 'json']),
  ) as {
    services: { anvil: { image: string } };
  };
  const image = config.services.anvil.image;
  assert.match(image, /@sha256:[a-f0-9]{64}$/);
  const name = `remitee-build-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    command([
      'create',
      '--name',
      name,
      '--entrypoint',
      'sh',
      '--mount',
      `type=bind,source=${resolve(root, 'contracts')},target=/source,readonly`,
      image,
      '-c',
      'mkdir -p /tmp/work; cp -R /source/src /source/test /source/lib /source/foundry.toml /source/remappings.txt /tmp/work/; cd /tmp/work; forge build',
    ]);
    command(['start', '-a', name]);
    for (const contract of ['Escrow', 'MockERC20'])
      command([
        'cp',
        `${name}:/tmp/work/out/${contract}.sol/${contract}.json`,
        resolve(output, `${contract}.json`),
      ]);
  } finally {
    command(['rm', '--force', '--volumes', name]);
  }
  return readArtifacts(output);
}
export function readArtifacts(output: string) {
  const escrow = JSON.parse(readFileSync(resolve(output, 'Escrow.json'), 'utf8')) as Artifact;
  const token = JSON.parse(readFileSync(resolve(output, 'MockERC20.json'), 'utf8')) as Artifact;
  const shape = (event: {
    name?: string;
    type: string;
    anonymous?: boolean;
    inputs?: readonly { name?: string; type: string; indexed?: boolean }[];
  }) => ({
    name: event.name,
    type: event.type,
    anonymous: event.anonymous ?? false,
    inputs: event.inputs?.map((i) => ({ name: i.name, type: i.type, indexed: i.indexed ?? false })),
  });
  assert.deepEqual(
    escrowEvents.map(shape).sort((a, b) => a.name!.localeCompare(b.name!)),
    escrow.abi
      .filter((i) => i.type === 'event')
      .map(shape)
      .sort((a, b) => a.name!.localeCompare(b.name!)),
  );
  return { escrow, token };
}
