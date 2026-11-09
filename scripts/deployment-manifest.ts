import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Address, Hex } from 'viem';
import { createPublicClient, http, keccak256 } from 'viem';
import type { Deployment } from '../apps/indexer/config.ts';
import { deployment } from '../apps/indexer/config.ts';
export async function captureDeployment(
  rpcUrl: string,
  address: Address,
  transactionHash: Hex,
  expectedCodeHash: Hex,
): Promise<Deployment> {
  const client = createPublicClient({ transport: http(rpcUrl, { retryCount: 0, timeout: 3_000 }) });
  const [chainId, genesis, receipt, code] = await Promise.all([
    client.getChainId(),
    client.getBlock({ blockNumber: 0n }),
    client.getTransactionReceipt({ hash: transactionHash }),
    client.getCode({ address }),
  ]);
  if (
    receipt.status !== 'success' ||
    receipt.contractAddress?.toLowerCase() !== address.toLowerCase() ||
    !code ||
    keccak256(code) !== expectedCodeHash
  )
    throw new Error('Deployment does not match compiled Escrow');
  const blockNumber = Number(receipt.blockNumber);
  return deployment({
    version: 1,
    abiVersion: 'escrow-v1',
    chainId,
    genesisHash: genesis.hash,
    address,
    deploymentBlock: blockNumber,
    deploymentHash: receipt.blockHash,
    deploymentTransactionHash: transactionHash,
    codeHash: keccak256(code),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [address, hash, output] = process.argv.slice(2);
    if (!process.env.RPC_URL || !address || !hash || !output)
      throw new Error(
        'Usage: RPC_URL=... npm run indexer:manifest -- ADDRESS DEPLOYMENT_TX OUTPUT',
      );
    const { compileArtifacts } = await import('./build-artifacts.ts');
    const artifacts = compileArtifacts(resolve('.local/artifacts'));
    const manifest = await captureDeployment(
      process.env.RPC_URL,
      address as Address,
      hash as Hex,
      keccak256(artifacts.escrow.deployedBytecode.object),
    );
    mkdirSync(dirname(resolve(output)), { recursive: true });
    writeFileSync(resolve(output), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    console.log('Validated descriptor written');
  } catch {
    console.error('MANIFEST_REFUSED: check RPC, deployment, compiled code and unused output path');
    process.exitCode = 1;
  }
}
