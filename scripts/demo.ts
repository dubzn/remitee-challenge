import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createPublicClient, createWalletClient, http, keccak256, parseEventLogs } from 'viem';
import type { Address, Hex } from 'viem';
import { anvil } from 'viem/chains';
import { admissionDelay, deployment } from '../apps/indexer/config.ts';
import { chainReader } from '../apps/indexer/rpc.ts';
import type { Settings } from '../apps/indexer/config.ts';
import { readArtifacts } from './build-artifacts.ts';

type Detail = { escrow: {
  sender: string; beneficiary: string; token: string;
  id: string; onChainStatus: string; effectiveStatus: string; canCancel: boolean; canRecover: boolean;
  amount: string; creationTxHash: string; resolutionTxHash: string | null;
}; observation: unknown };
try {
  // This runner intentionally sends transactions and changes time on this local fixture only.
  assert.equal(process.env.RPC_URL, 'http://anvil:8545', 'Demo requires the Compose Anvil service');
  assert.equal(process.env.API_URL, 'http://application:3000', 'Demo requires the Compose application');
  const rpcUrl = process.env.RPC_URL;
  const apiUrl = process.env.API_URL;
  const descriptor = JSON.parse(readFileSync(process.env.DEPLOYMENT_FILE!, 'utf8'));
  const d = deployment(descriptor);
  const artifacts = readArtifacts('/app/artifacts');
  assert.equal(d.chainId, 31337);
  assert.equal(d.codeHash, keccak256(artifacts.escrow.deployedBytecode.object));
  await chainReader({ rpcUrl, deployment: d } as Settings).identity();
  const client = createPublicClient({ chain: anvil, transport: http(rpcUrl, { retryCount: 0, timeout: 5_000 }) });
  const accounts = await createWalletClient({ chain: anvil, transport: http(rpcUrl) }).getAddresses();
  const sender = accounts[0]!;
  const beneficiary = accounts[1]!;
  assert.ok(sender && beneficiary);
  const wallet = createWalletClient({ chain: anvil, account: sender, transport: http(rpcUrl) });
  const other = createWalletClient({ chain: anvil, account: beneficiary, transport: http(rpcUrl) });
  const token = descriptor.localTokenAddress as Address;
  assert.match(token, /^0x[0-9a-fA-F]{40}$/);
  const code = await client.getCode({ address: token });
  assert.ok(code);
  assert.equal(keccak256(code), keccak256(artifacts.token.deployedBytecode.object));
  const receipt = async (hash: Hex) => {
    const result = await client.waitForTransactionReceipt({ hash, pollingInterval: 50, timeout: 15_000 });
    assert.equal(result.status, 'success');
    return result;
  };
  const mine = async () => {
    const blocks = admissionDelay();
    if (blocks) await client.request({ method: 'anvil_mine' as never, params: [`0x${blocks.toString(16)}`] as never });
  };
  async function get(path: string) {
    const response = await fetch(`${apiUrl}${path}`, { signal: AbortSignal.timeout(5_000) });
    return { status: response.status, body: await response.json() as any };
  }
  async function observed(id: bigint, expected: string): Promise<Detail> {
    const until = Date.now() + 60_000;
    while (Date.now() < until) {
      const result = await get(`/escrows/${id}`);
      if (result.status === 200 && result.body.escrow.effectiveStatus === expected) return result.body;
      await delay(200);
    }
    throw new Error(`Timed out observing escrow ${id} as ${expected}`);
  }
  const balance = (account: Address) => client.readContract({ address: token, abi: artifacts.token.abi, functionName: 'balanceOf', args: [account] }) as Promise<bigint>;
  const initialHealth = await get('/health');
  assert.equal(initialHealth.status, 200, 'Running application must be ready before demo transactions');
  assert.equal(initialHealth.body.observation.confirmationDelay, admissionDelay(), 'Demo CONFIRMATION_DELAY does not match running application');
  const before = { sender: await balance(sender), beneficiary: await balance(beneficiary), escrow: await balance(d.address) };
  await receipt(await wallet.writeContract({ address: token, abi: artifacts.token.abi, functionName: 'mint', args: [sender, 40n] }));
  await receipt(await wallet.writeContract({ address: token, abi: artifacts.token.abi, functionName: 'approve', args: [d.address, 40n] }));
  const deposits: { id: bigint; creationTx: Hex }[] = [];
  for (let i = 0; i < 4; i++) {
    const created = await receipt(await wallet.writeContract({ address: d.address, abi: artifacts.escrow.abi, functionName: 'createEscrow', args: [beneficiary, token, 10n] }));
    const event = parseEventLogs({ abi: artifacts.escrow.abi, logs: created.logs, eventName: 'EscrowCreated' })[0];
    assert.ok(event);
    deposits.push({ id: (event.args as { id: bigint }).id, creationTx: created.transactionHash });
  }
  const resolutionTxs: Hex[] = [];
  const payouts: { id: string; action: string; recipient: Address; amount: string; transactionHash: Hex }[] = [];
  for (const [index, action, byBeneficiary] of [[0, 'cancelEscrow', false], [1, 'confirmEscrow', true], [2, 'rejectEscrow', true]] as const) {
    const previous = { sender: await balance(sender), beneficiary: await balance(beneficiary), escrow: await balance(d.address) };
    const resolved = await receipt(await (byBeneficiary ? other : wallet).writeContract({ address: d.address, abi: artifacts.escrow.abi, functionName: action, args: [deposits[index]!.id] }));
    resolutionTxs.push(resolved.transactionHash);
    const released = action === 'confirmEscrow';
    assert.equal(await balance(sender), previous.sender + (released ? 0n : 10n));
    assert.equal(await balance(beneficiary), previous.beneficiary + (released ? 10n : 0n));
    assert.equal(await balance(d.address), previous.escrow - 10n);
    payouts.push({ id: deposits[index]!.id.toString(), action, recipient: released ? beneficiary : sender, amount: '10', transactionHash: resolved.transactionHash });
  }
  await mine();
  const states = ['CancelledBySender', 'Released', 'Rejected', 'Expired'];
  for (let i = 0; i < 3; i++) {
    const detail = await observed(deposits[i]!.id, states[i]!);
    assert.equal(detail.escrow.creationTxHash, deposits[i]!.creationTx);
    assert.equal(detail.escrow.resolutionTxHash, resolutionTxs[i]);
    assert.equal(detail.escrow.amount, '10');
  }
  const expiredId = deposits[3]!.id;
  const record = await client.readContract({ address: d.address, abi: artifacts.escrow.abi, functionName: 'getEscrow', args: [expiredId] }) as { expiresAt: bigint; status: number };
  assert.equal(record.status, 0);
  await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [Number(record.expiresAt)] as never });
  await client.request({ method: 'anvil_mine' as never, params: ['0x1'] as never });
  await mine();
  const expiredBeforeRecovery = await observed(expiredId, 'ExpiredRecoverable');
  const unclaimed = await client.readContract({ address: d.address, abi: artifacts.escrow.abi, functionName: 'getEscrow', args: [expiredId] }) as { status: number };
  assert.equal(unclaimed.status, 0, 'Expiry alone must leave on-chain storage Pending');
  assert.equal(expiredBeforeRecovery.escrow.onChainStatus, 'Pending');
  assert.equal(expiredBeforeRecovery.escrow.canRecover, true);
  assert.equal(expiredBeforeRecovery.escrow.canCancel, false);
  assert.equal(expiredBeforeRecovery.escrow.resolutionTxHash, null);
  assert.equal(await balance(d.address), before.escrow + 10n);
  const expiredList = await get(`/escrows?sender=${sender}&beneficiary=${beneficiary}&status=ExpiredRecoverable`);
  assert.equal(expiredList.status, 200);
  assert.ok(expiredList.body.items.some((item: { id: string }) => item.id === expiredId.toString()));
  const beforeRecovery = { sender: await balance(sender), beneficiary: await balance(beneficiary), escrow: await balance(d.address) };
  const recovered = await receipt(await wallet.writeContract({ address: d.address, abi: artifacts.escrow.abi, functionName: 'recoverExpiredEscrow', args: [expiredId] }));
  assert.equal(await balance(sender), beforeRecovery.sender + 10n);
  assert.equal(await balance(beneficiary), beforeRecovery.beneficiary);
  assert.equal(await balance(d.address), beforeRecovery.escrow - 10n);
  payouts.push({ id: expiredId.toString(), action: 'recoverExpiredEscrow', recipient: sender, amount: '10', transactionHash: recovered.transactionHash });
  resolutionTxs.push(recovered.transactionHash);
  await mine();
  const final = await Promise.all(deposits.map((deposit, i) => observed(deposit.id, states[i]!)));
  for (let i = 0; i < final.length; i++) {
    assert.equal(final[i]!.escrow.onChainStatus, states[i]);
    assert.equal(final[i]!.escrow.creationTxHash, deposits[i]!.creationTx);
    assert.equal(final[i]!.escrow.resolutionTxHash, resolutionTxs[i]);
    assert.equal(final[i]!.escrow.sender, sender.toLowerCase());
    assert.equal(final[i]!.escrow.beneficiary, beneficiary.toLowerCase());
    assert.equal(final[i]!.escrow.token, token.toLowerCase());
    assert.equal(final[i]!.escrow.amount, '10');
    const onChain = await client.readContract({ address: d.address, abi: artifacts.escrow.abi, functionName: 'getEscrow', args: [deposits[i]!.id] }) as { status: number; amount: bigint };
    assert.equal(onChain.status, i + 1);
    assert.equal(onChain.amount, 10n);
  }
  assert.equal(await balance(sender), before.sender + 30n);
  assert.equal(await balance(beneficiary), before.beneficiary + 10n);
  assert.equal(await balance(d.address), before.escrow);
  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.observation.confirmationDelay, admissionDelay());
  assert.equal(health.body.observation.headLag, String(admissionDelay()));
  assert.equal(health.body.observation.eligibleBacklog, '0');
  console.log(JSON.stringify({ result: 'pass', confirmationDelay: admissionDelay(), sender, beneficiary,
    expiredBeforeRecovery, onChainVerified: true, payouts, outcomes: final.map(detail => detail.escrow),
    balances: { senderIncrease: '30', beneficiaryIncrease: '10', escrowChange: '0' }, observation: health.body.observation,
  }, null, 2));
} catch (error) {
  console.error('DEMO_FAILED', error instanceof Error ? error.message : 'unavailable');
  process.exitCode = 1;
}
