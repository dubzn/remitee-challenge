import { keccak256 } from 'viem';
import type { Hex } from 'viem';
import type { Settings } from './config.ts';
export type Header = { number: Hex; hash: Hex; timestamp: Hex };
export class ObservationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export function chainReader(config: Settings) {
  async function rpc<T = unknown>(method: string, params: readonly unknown[] = []): Promise<T> {
    if (!/^(eth_(chainId|blockNumber|call|get[A-Za-z]+)|net_version|web3_clientVersion)$/.test(method))
      throw new ObservationError('rpc_method_not_readonly');
    try {
      const response = await fetch(config.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { result?: T; error?: unknown };
      if (body.error || body.result === undefined) throw new Error();
      return body.result;
    } catch {
      throw new ObservationError('rpc_unavailable');
    }
  }
  const block = (number: bigint | 'latest') =>
    rpc<Header | null>('eth_getBlockByNumber', [
      number === 'latest' ? 'latest' : `0x${number.toString(16)}`,
      false,
    ]);
  async function identity() {
    const d = config.deployment;
    const [chainId, genesis, anchor, code, receipt] = await Promise.all([
      rpc<Hex>('eth_chainId'),
      block(0n),
      block(BigInt(d.deploymentBlock)),
      rpc<Hex>('eth_getCode', [d.address, 'latest']),
      rpc<{ status: Hex; contractAddress: string | null; blockHash: Hex } | null>(
        'eth_getTransactionReceipt',
        [d.deploymentTransactionHash],
      ),
    ]);
    if (
      BigInt(chainId) !== BigInt(d.chainId) ||
      genesis?.hash !== d.genesisHash ||
      anchor?.hash !== d.deploymentHash ||
      code === '0x' ||
      keccak256(code) !== d.codeHash ||
      receipt?.status !== '0x1' ||
      receipt.contractAddress?.toLowerCase() !== d.address ||
      receipt.blockHash !== d.deploymentHash
    )
      throw new ObservationError('deployment_identity_mismatch');
  }
  async function delayedRequest({
    method,
    params = [],
  }: {
    method: string;
    params?: readonly unknown[];
  }): Promise<any> {
    await identity();
    const head = BigInt(await rpc<Hex>('eth_blockNumber'));
    const eligible = head >= BigInt(config.confirmationDelay) ? head - BigInt(config.confirmationDelay) : 0n;
    const hex = `0x${eligible.toString(16)}`;
    if (method === 'eth_blockNumber') return hex;
    if (method === 'eth_getBlockByNumber' && ['latest', 'safe', 'finalized'].includes(String(params[0])))
      return rpc(method, [hex, params[1] ?? false]);
    if (method === 'eth_getBlockByNumber' && BigInt(String(params[0])) > eligible)
      throw new ObservationError('block_not_eligible');
    if (method === 'eth_getLogs') {
      const filter = params[0] as { fromBlock?: string; toBlock?: string; blockHash?: Hex };
      // EIP-234 hash filters cannot be combined with fromBlock/toBlock.
      if (filter.blockHash) {
        const header = await rpc<Header | null>('eth_getBlockByHash', [filter.blockHash, false]);
        if (!header || BigInt(header.number) > eligible) throw new ObservationError('block_not_eligible');
        return rpc(method, params);
      }
      const from = filter.fromBlock && filter.fromBlock !== 'earliest' ? BigInt(filter.fromBlock) : 0n;
      if (from > eligible) return [];
      const requested =
        !filter.toBlock || ['latest', 'safe', 'finalized'].includes(filter.toBlock)
          ? eligible
          : BigInt(filter.toBlock);
      return rpc(method, [
        { ...filter, toBlock: `0x${(requested > eligible ? eligible : requested).toString(16)}` },
      ]);
    }
    const result = await rpc<any>(method, params);
    if (method === 'eth_getBlockByHash' && result && BigInt(result.number) > eligible)
      throw new ObservationError('block_not_eligible');
    return result;
  }
  return { rpc, block, identity, delayedRequest };
}
