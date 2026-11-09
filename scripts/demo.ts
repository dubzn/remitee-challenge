import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { Address, Hex } from 'viem';
import { createPublicClient, createWalletClient, http, keccak256, parseEventLogs } from 'viem';
import { anvil } from 'viem/chains';
import type { publicEscrow, publicObservation } from '../apps/indexer/api/domain.ts';
import type { Settings } from '../apps/indexer/config.ts';
import { deployment, parseConfirmationDelay } from '../apps/indexer/config.ts';
import { chainReader } from '../apps/indexer/rpc.ts';
import { readArtifacts } from './build-artifacts.ts';

const depositAmount = 10n;
const outcomes = [
  {
    action: 'cancelEscrow',
    status: 'CancelledBySender',
    contractStatus: 1,
    caller: 'sender',
    recipient: 'sender',
  },
  {
    action: 'confirmEscrow',
    status: 'Released',
    contractStatus: 2,
    caller: 'beneficiary',
    recipient: 'beneficiary',
  },
  {
    action: 'rejectEscrow',
    status: 'Rejected',
    contractStatus: 3,
    caller: 'beneficiary',
    recipient: 'sender',
  },
  {
    action: 'recoverExpiredEscrow',
    status: 'Expired',
    contractStatus: 4,
    caller: 'sender',
    recipient: 'sender',
  },
] as const;

type Outcome = (typeof outcomes)[number];
type Deposit = { id: bigint; creationTx: Hex; outcome: Outcome };
type Payout = {
  id: string;
  action: string;
  recipient: Address;
  amount: string;
  transactionHash: Hex;
};
type ResolvedDeposit = Deposit & { payout: Payout };
type Fixture = Awaited<ReturnType<typeof connectLocalFixture>>;
type Balances = { sender: bigint; beneficiary: bigint; escrow: bigint };
type Observation = ReturnType<typeof publicObservation>;
type Detail = { escrow: ReturnType<typeof publicEscrow>; observation: Observation };

async function connectLocalFixture() {
  // This runner sends transactions and changes time only on the Compose fixture.
  assert.equal(process.env.RPC_URL, 'http://anvil:8545', 'Demo requires the Compose Anvil service');
  assert.equal(
    process.env.API_URL,
    'http://application:3000',
    'Demo requires the Compose application',
  );
  const rpcUrl = process.env.RPC_URL;
  const apiUrl = process.env.API_URL;
  const descriptor = JSON.parse(readFileSync(process.env.DEPLOYMENT_FILE!, 'utf8'));
  const deployed = deployment(descriptor);
  const artifacts = readArtifacts('/app/artifacts');
  assert.equal(deployed.chainId, 31337);
  assert.equal(deployed.codeHash, keccak256(artifacts.escrow.deployedBytecode.object));
  await chainReader({ rpcUrl, deployment: deployed } as Settings).identity();

  const client = createPublicClient({
    chain: anvil,
    transport: http(rpcUrl, { retryCount: 0, timeout: 5_000 }),
  });
  const accounts = await createWalletClient({
    chain: anvil,
    transport: http(rpcUrl),
  }).getAddresses();
  const sender = accounts[0]!;
  const beneficiary = accounts[1]!;
  assert.ok(sender && beneficiary);
  const senderWallet = createWalletClient({
    chain: anvil,
    account: sender,
    transport: http(rpcUrl),
  });
  const beneficiaryWallet = createWalletClient({
    chain: anvil,
    account: beneficiary,
    transport: http(rpcUrl),
  });

  const token = descriptor.localTokenAddress as Address;
  assert.match(token, /^0x[0-9a-fA-F]{40}$/);
  const code = await client.getCode({ address: token });
  assert.ok(code);
  assert.equal(keccak256(code), keccak256(artifacts.token.deployedBytecode.object));
  return {
    client,
    senderWallet,
    beneficiaryWallet,
    sender,
    beneficiary,
    token,
    deployed,
    artifacts,
    apiUrl,
  };
}

async function requestApi<T>(fixture: Fixture, path: string) {
  const response = await fetch(`${fixture.apiUrl}${path}`, { signal: AbortSignal.timeout(5_000) });
  return { status: response.status, body: (await response.json()) as T };
}

async function assertReadyForWrites(fixture: Fixture) {
  const health = await requestApi<{ observation: Observation }>(fixture, '/health');
  assert.equal(health.status, 200, 'Running application must be ready before demo transactions');
  assert.equal(
    health.body.observation.confirmationDelay,
    parseConfirmationDelay(),
    'Demo CONFIRMATION_DELAY does not match running application',
  );
}

async function successfulReceipt(fixture: Fixture, hash: Hex) {
  const receipt = await fixture.client.waitForTransactionReceipt({
    hash,
    pollingInterval: 50,
    timeout: 15_000,
  });
  assert.equal(receipt.status, 'success');
  return receipt;
}

async function mineConfirmations(fixture: Fixture) {
  const blocks = parseConfirmationDelay();
  if (blocks) {
    await fixture.client.request({
      method: 'anvil_mine' as never,
      params: [`0x${blocks.toString(16)}`] as never,
    });
  }
}

async function waitForStatus(fixture: Fixture, id: bigint, expected: string): Promise<Detail> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await requestApi<Detail>(fixture, `/escrows/${id}`);
    if (result.status === 200 && result.body.escrow.effectiveStatus === expected)
      return result.body;
    await delay(200);
  }
  throw new Error(`Timed out observing escrow ${id} as ${expected}`);
}

async function balances(fixture: Fixture): Promise<Balances> {
  const balanceOf = (account: Address) =>
    fixture.client.readContract({
      address: fixture.token,
      abi: fixture.artifacts.token.abi,
      functionName: 'balanceOf',
      args: [account],
    }) as Promise<bigint>;
  return {
    sender: await balanceOf(fixture.sender),
    beneficiary: await balanceOf(fixture.beneficiary),
    escrow: await balanceOf(fixture.deployed.address),
  };
}

async function readEscrow(fixture: Fixture, id: bigint) {
  return fixture.client.readContract({
    address: fixture.deployed.address,
    abi: fixture.artifacts.escrow.abi,
    functionName: 'getEscrow',
    args: [id],
  }) as Promise<{ expiresAt: bigint; status: number; amount: bigint }>;
}

async function fundAndCreateDeposits(fixture: Fixture): Promise<Deposit[]> {
  for (const [functionName, args] of [
    ['mint', [fixture.sender, 40n]],
    ['approve', [fixture.deployed.address, 40n]],
  ] as const) {
    await successfulReceipt(
      fixture,
      await fixture.senderWallet.writeContract({
        address: fixture.token,
        abi: fixture.artifacts.token.abi,
        functionName,
        args,
      }),
    );
  }

  const deposits: Deposit[] = [];
  for (const outcome of outcomes) {
    const receipt = await successfulReceipt(
      fixture,
      await fixture.senderWallet.writeContract({
        address: fixture.deployed.address,
        abi: fixture.artifacts.escrow.abi,
        functionName: 'createEscrow',
        args: [fixture.beneficiary, fixture.token, depositAmount],
      }),
    );
    const event = parseEventLogs({
      abi: fixture.artifacts.escrow.abi,
      logs: receipt.logs,
      eventName: 'EscrowCreated',
    })[0];
    assert.ok(event);
    deposits.push({
      id: (event.args as { id: bigint }).id,
      creationTx: receipt.transactionHash,
      outcome,
    });
  }
  return deposits;
}

function assertPayoutBalances(before: Balances, after: Balances, recipient: Outcome['recipient']) {
  assert.equal(after.sender, before.sender + (recipient === 'sender' ? depositAmount : 0n));
  assert.equal(
    after.beneficiary,
    before.beneficiary + (recipient === 'beneficiary' ? depositAmount : 0n),
  );
  assert.equal(after.escrow, before.escrow - depositAmount);
}

async function resolveDeposit(fixture: Fixture, deposit: Deposit): Promise<ResolvedDeposit> {
  const { outcome } = deposit;
  const wallet = outcome.caller === 'sender' ? fixture.senderWallet : fixture.beneficiaryWallet;
  const before = await balances(fixture);
  const receipt = await successfulReceipt(
    fixture,
    await wallet.writeContract({
      address: fixture.deployed.address,
      abi: fixture.artifacts.escrow.abi,
      functionName: outcome.action,
      args: [deposit.id],
    }),
  );
  assertPayoutBalances(before, await balances(fixture), outcome.recipient);
  return {
    ...deposit,
    payout: {
      id: deposit.id.toString(),
      action: outcome.action,
      recipient: fixture[outcome.recipient],
      amount: depositAmount.toString(),
      transactionHash: receipt.transactionHash,
    },
  };
}

function assertResolutionTrace(deposit: ResolvedDeposit, detail: Detail) {
  assert.equal(detail.escrow.creationTxHash, deposit.creationTx);
  assert.equal(detail.escrow.resolutionTxHash, deposit.payout.transactionHash);
  assert.equal(detail.escrow.amount, depositAmount.toString());
}

async function verifyPassiveExpiry(
  fixture: Fixture,
  deposit: Deposit,
  initialEscrowBalance: bigint,
) {
  const record = await readEscrow(fixture, deposit.id);
  assert.equal(record.status, 0);
  await fixture.client.request({
    method: 'evm_setNextBlockTimestamp' as never,
    params: [Number(record.expiresAt)] as never,
  });
  await fixture.client.request({ method: 'anvil_mine' as never, params: ['0x1'] as never });
  await mineConfirmations(fixture);

  const detail = await waitForStatus(fixture, deposit.id, 'ExpiredRecoverable');
  const unclaimed = await readEscrow(fixture, deposit.id);
  assert.equal(unclaimed.status, 0, 'Expiry alone must leave on-chain storage Pending');
  assert.equal(detail.escrow.onChainStatus, 'Pending');
  assert.equal(detail.escrow.canRecover, true);
  assert.equal(detail.escrow.canCancel, false);
  assert.equal(detail.escrow.resolutionTxHash, null);
  assert.equal((await balances(fixture)).escrow, initialEscrowBalance + depositAmount);

  const path = `/escrows?sender=${fixture.sender}&beneficiary=${fixture.beneficiary}&status=ExpiredRecoverable`;
  const list = await requestApi<{ items: { id: string }[] }>(fixture, path);
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((item) => item.id === deposit.id.toString()));
  return detail;
}

async function verifyFinalEscrows(fixture: Fixture, resolved: ResolvedDeposit[]) {
  const final = await Promise.all(
    resolved.map((deposit) => waitForStatus(fixture, deposit.id, deposit.outcome.status)),
  );
  for (const [index, deposit] of resolved.entries()) {
    const detail = final[index]!;
    assertResolutionTrace(deposit, detail);
    assert.equal(detail.escrow.onChainStatus, deposit.outcome.status);
    assert.equal(detail.escrow.sender, fixture.sender.toLowerCase());
    assert.equal(detail.escrow.beneficiary, fixture.beneficiary.toLowerCase());
    assert.equal(detail.escrow.token, fixture.token.toLowerCase());
    const onChain = await readEscrow(fixture, deposit.id);
    assert.equal(onChain.status, deposit.outcome.contractStatus);
    assert.equal(onChain.amount, depositAmount);
  }
  return final.map((detail) => detail.escrow);
}

async function finalObservation(fixture: Fixture) {
  const health = await requestApi<{ observation: Observation }>(fixture, '/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.observation.confirmationDelay, parseConfirmationDelay());
  assert.equal(health.body.observation.headLag, String(parseConfirmationDelay()));
  assert.equal(health.body.observation.eligibleBacklog, '0');
  return health.body.observation;
}

async function runDemo() {
  const fixture = await connectLocalFixture();
  await assertReadyForWrites(fixture);
  const before = await balances(fixture);
  const deposits = await fundAndCreateDeposits(fixture);

  const resolved: ResolvedDeposit[] = [];
  for (const deposit of deposits) {
    if (deposit.outcome.action !== 'recoverExpiredEscrow') {
      resolved.push(await resolveDeposit(fixture, deposit));
    }
  }
  await mineConfirmations(fixture);
  for (const deposit of resolved) {
    assertResolutionTrace(
      deposit,
      await waitForStatus(fixture, deposit.id, deposit.outcome.status),
    );
  }

  const expiring = deposits.find((deposit) => deposit.outcome.action === 'recoverExpiredEscrow');
  assert.ok(expiring);
  const expiredBeforeRecovery = await verifyPassiveExpiry(fixture, expiring, before.escrow);
  resolved.push(await resolveDeposit(fixture, expiring));
  await mineConfirmations(fixture);

  const final = await verifyFinalEscrows(fixture, resolved);
  const after = await balances(fixture);
  assert.equal(after.sender, before.sender + 30n);
  assert.equal(after.beneficiary, before.beneficiary + 10n);
  assert.equal(after.escrow, before.escrow);
  const observation = await finalObservation(fixture);
  console.log(
    JSON.stringify(
      {
        result: 'pass',
        confirmationDelay: parseConfirmationDelay(),
        sender: fixture.sender,
        beneficiary: fixture.beneficiary,
        expiredBeforeRecovery,
        onChainVerified: true,
        payouts: resolved.map((deposit) => deposit.payout),
        outcomes: final,
        balances: { senderIncrease: '30', beneficiaryIncrease: '10', escrowChange: '0' },
        observation,
      },
      null,
      2,
    ),
  );
}

try {
  await runDemo();
} catch (error) {
  console.error('DEMO_FAILED', error instanceof Error ? error.message : 'unavailable');
  process.exitCode = 1;
}
