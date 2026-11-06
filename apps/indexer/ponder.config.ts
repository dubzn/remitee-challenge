import { createConfig } from 'ponder';
import { custom } from 'viem';
import { escrowEvents } from './abi.ts';
import { settings } from './config.ts';
import { chainReader } from './rpc.ts';
const config = settings();
export default createConfig({
  database: { kind: 'postgres', connectionString: config.databaseUrl },
  chains: {
    escrow: {
      id: config.deployment.chainId,
      rpc: custom({ request: chainReader(config).delayedRequest }, { retryCount: 0 }),
      cacheRpcRequests: false,
      pollingInterval: config.pollMs,
      reorgWindow: config.reorgWindow,
      ethGetLogsBlockRange: 1_000,
    },
  },
  contracts: {
    Escrow: {
      abi: escrowEvents,
      address: config.deployment.address,
      chain: 'escrow',
      startBlock: config.deployment.deploymentBlock,
    },
  },
  blocks: { Progress: { chain: 'escrow', startBlock: config.deployment.deploymentBlock, interval: 1 } },
});
