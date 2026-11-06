import { readFileSync } from 'node:fs';

export async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(process.env.POC_RPC_URL!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error(`RPC ${method} unavailable (${response.status})`);
  const body = await response.json() as { result: any; error?: { code: number } };
  if (body.error) throw new Error(`RPC ${method} failed (${body.error.code})`);
  return body.result;
}

export async function validateIdentity() {
  const manifest = JSON.parse(readFileSync(process.env.POC_MANIFEST!, 'utf8'));
  const [chainId, anchor, genesis] = await Promise.all([
    rpc('eth_chainId'),
    rpc('eth_getBlockByNumber', [`0x${manifest.deploymentBlock.toString(16)}`, false]),
    rpc('eth_getBlockByNumber', ['0x0', false]),
  ]);
  if (chainId !== '0x7a69' || anchor?.hash !== manifest.deploymentHash || genesis?.hash !== manifest.genesisHash) {
    throw new Error('PoC deployment identity mismatch');
  }
}

// A read-only view of the canonical chain delayed by N blocks, not another indexer.
export async function delayedRequest({ method, params }: { method: string; params?: readonly unknown[] }) {
  await validateIdentity();
  const delay = BigInt(process.env.POC_CONFIRMATION_DELAY ?? '2');
  if (method === 'eth_blockNumber' || (method === 'eth_getBlockByNumber' && params?.[0] === 'latest')) {
    const head = BigInt(await rpc('eth_blockNumber'));
    const eligible = head > delay ? head - delay : 0n;
    const hex = `0x${eligible.toString(16)}`;
    return method === 'eth_blockNumber' ? hex : rpc(method, [hex, params?.[1] ?? false]);
  }
  return rpc(method, params ? [...params] : []);
}
