import { createPublicClient, createWalletClient, http, keccak256 } from 'viem';
import { anvil } from 'viem/chains';
import type { Address } from 'viem';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compileArtifacts } from './build-artifacts.ts';
import { captureDeployment } from './deployment-manifest.ts';
import { deployment } from '../apps/indexer/config.ts';
import { chainReader } from '../apps/indexer/rpc.ts';
import type { Settings } from '../apps/indexer/config.ts';
try {
  const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(rpcUrl).hostname))
    throw new Error('Local deploy requires a loopback RPC');
  const client = createPublicClient({ chain: anvil, transport: http(rpcUrl, { retryCount: 0 }) });
  if ((await client.getChainId()) !== 31337) throw new Error('Local deploy requires Anvil chain 31337');
  const file = resolve(process.env.DEPLOYMENT_FILE ?? '.local/deployment.json');
  if (existsSync(file)) {
    const d = deployment(JSON.parse(readFileSync(file, 'utf8')));
    await chainReader({ rpcUrl, deployment: d } as Settings).identity();
    console.log('Reusing validated local deployment descriptor');
  } else {
    const [sender] = await createWalletClient({ chain: anvil, transport: http(rpcUrl) }).getAddresses();
    if (!sender) throw new Error('Local Anvil unlocked account unavailable');
    const artifacts = compileArtifacts(resolve('.local/artifacts'));
    const wallet = createWalletClient({ chain: anvil, account: sender, transport: http(rpcUrl) });
    const receipt = await client.waitForTransactionReceipt({
      hash: await wallet.deployContract({
        abi: artifacts.escrow.abi,
        bytecode: artifacts.escrow.bytecode.object,
      }),
    });
    const token = await client.waitForTransactionReceipt({
      hash: await wallet.deployContract({
        abi: artifacts.token.abi,
        bytecode: artifacts.token.bytecode.object,
      }),
    });
    const d = await captureDeployment(
      rpcUrl,
      receipt.contractAddress!,
      receipt.transactionHash,
      keccak256(artifacts.escrow.deployedBytecode.object),
    );
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...d, localTokenAddress: token.contractAddress }, null, 2) + '\n', {
      flag: 'wx',
    });
    // Idle Anvil does not produce confirmations by itself.
    await client.request({ method: 'anvil_mine' as never, params: ['0x2'] as never });
    console.log(`Local escrow ${d.address}; descriptor ${file}`);
  }
} catch (error) {
  console.error(
    'LOCAL_DEPLOY_REFUSED',
    error instanceof Error ? error.message.split('\n')[0] : 'unavailable',
  );
  process.exitCode = 1;
}
