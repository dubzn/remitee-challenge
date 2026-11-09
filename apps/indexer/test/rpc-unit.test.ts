import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { keccak256 } from 'viem';
import type { Settings } from '../config.ts';
import { chainReader } from '../rpc.ts';

type RpcCall = { method: string; params: unknown[] };
async function transportFixture() {
  const hash = (number: bigint) => keccak256(new TextEncoder().encode(String(number)));
  const contract = `0x${'11'.repeat(20)}` as `0x${string}`;
  const state = { height: 12n, rpcDown: false };
  const calls: RpcCall[] = [];
  const header = (number: bigint) => ({
    number: `0x${number.toString(16)}`,
    hash: hash(number),
    timestamp: '0x100',
  });
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const { method, params, id } = JSON.parse(body) as RpcCall & { id: number };
    calls.push({ method, params });
    if (state.rpcDown) {
      response.writeHead(503).end();
      return;
    }
    let result: unknown;
    switch (method) {
      case 'eth_chainId':
        result = '0x7a69';
        break;
      case 'eth_blockNumber':
        result = `0x${state.height.toString(16)}`;
        break;
      case 'eth_getBlockByNumber':
        result = header(BigInt(String(params[0])));
        break;
      case 'eth_getCode':
        result = '0x6000';
        break;
      case 'eth_getTransactionReceipt':
        result = { status: '0x1', contractAddress: contract, blockHash: hash(1n) };
        break;
      case 'eth_getLogs':
        result = [];
        break;
      default:
        throw new Error(`Unexpected method: ${method}`);
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const config = {
    rpcUrl: `http://127.0.0.1:${address.port}`,
    confirmationDelay: 2,
    deployment: {
      version: 1,
      abiVersion: 'escrow-v1',
      chainId: 31337,
      address: contract,
      genesisHash: hash(0n),
      deploymentBlock: 1,
      deploymentHash: hash(1n),
      deploymentTransactionHash: hash(100n),
      codeHash: keccak256('0x6000'),
    },
  } as Settings;
  const reader = chainReader(config);
  const latest = () =>
    reader.delayedRequest({ method: 'eth_getBlockByNumber', params: ['latest', true] });
  const close = async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  return { reader, latest, calls, state, header, close };
}

test('after startup validation each poll uses two fresh RPCs, including when blocks advance', async () => {
  const fixture = await transportFixture();
  try {
    await fixture.reader.identity();
    assert.equal(fixture.calls.length, 5);
    for (const height of [12n, 12n, 13n]) {
      fixture.state.height = height;
      fixture.calls.length = 0;
      assert.deepEqual(await fixture.latest(), fixture.header(height - 2n));
      assert.deepEqual(
        fixture.calls.map((call) => call.method),
        ['eth_blockNumber', 'eth_getBlockByNumber'],
      );
    }
    fixture.state.rpcDown = true;
    await assert.rejects(fixture.latest(), /rpc_unavailable/);
    fixture.state.rpcDown = false;
    fixture.calls.length = 0;
    await fixture.latest();
    assert.equal(fixture.calls.length, 2);
  } finally {
    await fixture.close();
  }
});

test('numeric blocks and log ranges remain capped before forwarding data', async () => {
  const fixture = await transportFixture();
  try {
    const request = fixture.reader.delayedRequest;
    await fixture.reader.identity();
    assert.equal(await request({ method: 'eth_blockNumber' }), '0xa');
    assert.deepEqual(
      await request({ method: 'eth_getBlockByNumber', params: ['safe', false] }),
      fixture.header(10n),
    );
    await assert.rejects(
      request({ method: 'eth_getBlockByNumber', params: ['0xb', false] }),
      /block_not_eligible/,
    );
    assert.deepEqual(
      await request({ method: 'eth_getLogs', params: [{ fromBlock: '0xb', toBlock: 'latest' }] }),
      [],
    );
    await request({ method: 'eth_getLogs', params: [{ fromBlock: '0x1', toBlock: 'latest' }] });
    const logs = fixture.calls.filter((call) => call.method === 'eth_getLogs');
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0]!.params, [{ fromBlock: '0x1', toBlock: '0xa' }]);
  } finally {
    await fixture.close();
  }
});
