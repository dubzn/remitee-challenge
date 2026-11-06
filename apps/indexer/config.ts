import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export type Deployment = {
  version: 1;
  abiVersion: 'escrow-v1';
  chainId: number;
  genesisHash: `0x${string}`;
  address: `0x${string}`;
  deploymentBlock: number;
  deploymentHash: `0x${string}`;
  deploymentTransactionHash: `0x${string}`;
  codeHash: `0x${string}`;
};
export type Settings = {
  deployment: Deployment;
  rpcUrl: string;
  databaseUrl: string;
  schema: string;
  confirmationDelay: number;
  reorgWindow: number;
  pollMs: number;
  port: number;
  scopeKey: string;
  startupMinBlock: bigint;
};
function integer(value: string | undefined, fallback: number, min: number, max: number, name: string) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max || value?.trim() === '')
    throw new Error(`Invalid ${name}`);
  return result;
}
export function deployment(value: unknown): Deployment {
  const d = value as Deployment;
  if (
    !d ||
    d.version !== 1 ||
    d.abiVersion !== 'escrow-v1' ||
    !Number.isSafeInteger(d.chainId) ||
    d.chainId <= 0 ||
    !Number.isSafeInteger(d.deploymentBlock) ||
    d.deploymentBlock < 0
  )
    throw new Error('Invalid deployment descriptor');
  for (const key of ['genesisHash', 'deploymentHash', 'deploymentTransactionHash', 'codeHash'] as const)
    if (!/^0x[0-9a-fA-F]{64}$/.test(d[key])) throw new Error(`Invalid deployment ${key}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(d.address) || /^0x0{40}$/i.test(d.address))
    throw new Error('Invalid deployment address');
  return {
    version: 1,
    abiVersion: 'escrow-v1',
    chainId: d.chainId,
    address: d.address.toLowerCase() as Deployment['address'],
    deploymentBlock: d.deploymentBlock,
    genesisHash: d.genesisHash.toLowerCase() as Deployment['genesisHash'],
    deploymentHash: d.deploymentHash.toLowerCase() as Deployment['deploymentHash'],
    deploymentTransactionHash:
      d.deploymentTransactionHash.toLowerCase() as Deployment['deploymentTransactionHash'],
    codeHash: d.codeHash.toLowerCase() as Deployment['codeHash'],
  };
}
export function settings(env: NodeJS.ProcessEnv = process.env): Settings {
  if (!env.RPC_URL || !env.DATABASE_URL || !env.DEPLOYMENT_FILE)
    throw new Error('RPC_URL, DATABASE_URL and DEPLOYMENT_FILE are required');
  const descriptor = deployment(JSON.parse(readFileSync(resolve(env.DEPLOYMENT_FILE), 'utf8')));
  const schema = env.INDEXER_SCHEMA ?? 'escrow_index';
  if (
    !/^[a-z][a-z0-9_]{0,47}$/.test(schema) ||
    ['public', 'information_schema'].includes(schema) ||
    schema.startsWith('pg_')
  )
    throw new Error('Invalid INDEXER_SCHEMA');
  const confirmationDelay = integer(env.CONFIRMATION_DELAY, 2, 0, 10_000, 'CONFIRMATION_DELAY');
  const reorgWindow = integer(env.REORG_WINDOW_SECONDS, 180, 1, 600, 'REORG_WINDOW_SECONDS');
  if (env.INDEXER_STARTUP_MIN_BLOCK && !/^\d+$/.test(env.INDEXER_STARTUP_MIN_BLOCK))
    throw new Error('Invalid startup floor');
  return {
    deployment: descriptor,
    startupMinBlock: BigInt(env.INDEXER_STARTUP_MIN_BLOCK ?? '0'),
    rpcUrl: env.RPC_URL,
    databaseUrl: env.DATABASE_URL,
    schema,
    confirmationDelay,
    reorgWindow,
    pollMs: integer(env.INDEXER_POLL_MS, 1_000, 100, 60_000, 'INDEXER_POLL_MS'),
    port: integer(env.INDEXER_PORT, 42069, 1, 65535, 'INDEXER_PORT'),
    scopeKey: createHash('sha256')
      .update(JSON.stringify({ descriptor, confirmationDelay, reorgWindow, projectionVersion: 1 }))
      .digest('hex'),
  };
}
