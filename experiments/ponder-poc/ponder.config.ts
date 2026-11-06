import { readFileSync } from 'node:fs';
import { createConfig } from 'ponder';
import { custom, http } from 'viem';
import { escrowEvents } from './abi';
import { delayedRequest } from './rpc';

const manifest = JSON.parse(readFileSync(process.env.POC_MANIFEST!, 'utf8')) as {
  address: `0x${string}`;
  deploymentBlock: number;
};

export default createConfig({
  database: { kind: 'postgres', connectionString: process.env.DATABASE_URL! },
  chains: {
    anvil: {
      id: 31337,
      rpc: ['guarded', 'checkpoint'].includes(process.env.POC_MODE ?? '')
        ? custom({ request: delayedRequest }, { retryCount: 0 })
        : http(process.env.POC_RPC_URL!, { retryCount: 0, timeout: 2_000 }),
      cacheRpcRequests: false,
      pollingInterval: 100,
      reorgWindow: process.env.POC_MODE === 'guarded' ? 0 : Number(process.env.POC_REORG_WINDOW ?? '180'),
      ethGetLogsBlockRange: 10,
    },
  },
  contracts: {
    Escrow: {
      abi: escrowEvents,
      address: manifest.address,
      chain: 'anvil',
      startBlock: manifest.deploymentBlock,
    },
  },
  blocks: process.env.POC_MODE === 'checkpoint' ? {
    Checkpoint: { chain: 'anvil', startBlock: manifest.deploymentBlock, interval: 1 },
  } : undefined,
});
