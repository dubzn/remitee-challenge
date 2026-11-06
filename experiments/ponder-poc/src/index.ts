import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { ponder } from 'ponder:registry';
import type { Context } from 'ponder:registry';
import { escrow, journal } from 'ponder:schema';
import type { Hex } from 'viem';

type Envelope = {
  args: { id: bigint };
  log: { logIndex: number };
  transaction: { hash: Hex };
  block: { number: bigint; hash: Hex };
};

async function record(name: string, event: Envelope, context: Context) {
  await context.db.insert(journal).values({
    transactionHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    blockNumber: event.block.number,
    blockHash: event.block.hash,
    escrowId: event.args.id,
    name,
  });
  // Driver-controlled interruption point; only present in this isolated experiment.
  const fault = process.env.POC_FAULT_FILE!;
  if (existsSync(fault) && readFileSync(fault, 'utf8').trim() === event.args.id.toString()) {
    writeFileSync(`${fault}.reached`, 'after journal, before projection');
    await setTimeout(30_000);
  }
}

ponder.on('Escrow:EscrowCreated', async ({ event, context }) => {
  await record('EscrowCreated', event, context);
  await context.db.insert(escrow).values({
    id: event.args.id,
    sender: event.args.sender,
    beneficiary: event.args.beneficiary,
    token: event.args.token,
    amount: event.args.amount,
    createdAt: event.args.createdAt,
    cancelDeadline: event.args.cancelDeadline,
    expiresAt: event.args.expiresAt,
    status: 'Pending',
  });
});

ponder.on('Escrow:EscrowCancelled', async ({ event, context }) => {
  await record('EscrowCancelled', event, context);
  await context.db.update(escrow, { id: event.args.id }).set({ status: 'CancelledBySender' });
});
ponder.on('Escrow:EscrowReleased', async ({ event, context }) => {
  await record('EscrowReleased', event, context);
  await context.db.update(escrow, { id: event.args.id }).set({ status: 'Released' });
});
ponder.on('Escrow:EscrowRejected', async ({ event, context }) => {
  await record('EscrowRejected', event, context);
  await context.db.update(escrow, { id: event.args.id }).set({ status: 'Rejected' });
});
ponder.on('Escrow:EscrowExpired', async ({ event, context }) => {
  await record('EscrowExpired', event, context);
  await context.db.update(escrow, { id: event.args.id }).set({ status: 'Expired' });
});
