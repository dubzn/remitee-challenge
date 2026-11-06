import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { ponder } from 'ponder:registry';
import type { Context } from 'ponder:registry';
import { checkpoint } from 'ponder:schema';
import type { Hex } from 'viem';
import { project } from '../projection';
import type { ObservedEvent } from '../projection';
import { ponderStore } from '../store';

type Envelope = {
  args: { id: bigint }; log: { logIndex: number }; transaction: { hash: Hex };
  block: { number: bigint; hash: Hex };
};
// Test-only redelivery cache; durable progress is owned by Ponder.
let lastObserved: ObservedEvent | undefined;
async function consume(name: string, event: Envelope, context: Context, transition: Pick<ObservedEvent, 'created' | 'outcome'>) {
  const observation: ObservedEvent = {
    name, transactionHash: event.transaction.hash, logIndex: event.log.logIndex,
    blockNumber: event.block.number, blockHash: event.block.hash, escrowId: event.args.id,
    payload: JSON.stringify(event.args, (_, value) => typeof value === 'bigint' ? value.toString() : value),
    ...transition,
  };
  const store = ponderStore(context);
  await project(observation, store, async () => {
    const fault = process.env.POC_FAULT_FILE!;
    if (existsSync(fault) && readFileSync(fault, 'utf8').trim() === event.args.id.toString()) {
      writeFileSync(`${fault}.reached`, 'after journal, before projection');
      await setTimeout(30_000);
    }
  });
  lastObserved = observation;
  if (process.env.POC_DUPLICATE_DELIVERY === '1') {
    if (await project(observation, store) !== 'duplicate') throw new Error('Duplicate applied twice');
    const conflicting = { ...observation, payload: `${observation.payload} ` };
    let rejected = false;
    try { await project(conflicting, store); } catch { rejected = true; }
    if (!rejected) throw new Error('Conflicting duplicate accepted');
  }
}
ponder.on('Escrow:EscrowCreated', async ({ event, context }) => {
  await consume('EscrowCreated', event, context, { created: { ...event.args, status: 'Pending' } });
});
ponder.on('Escrow:EscrowCancelled', async ({ event, context }) => consume('EscrowCancelled', event, context, { outcome: 'CancelledBySender' }));
ponder.on('Escrow:EscrowReleased', async ({ event, context }) => consume('EscrowReleased', event, context, { outcome: 'Released' }));
ponder.on('Escrow:EscrowRejected', async ({ event, context }) => consume('EscrowRejected', event, context, { outcome: 'Rejected' }));
ponder.on('Escrow:EscrowExpired', async ({ event, context }) => consume('EscrowExpired', event, context, { outcome: 'Expired' }));

if (process.env.POC_MODE === 'checkpoint') {
  ponder.on('Checkpoint:block', async ({ event, context }) => {
    const { number, hash, timestamp } = event.block;
    if (process.env.POC_DUPLICATE_DELIVERY === '1' && existsSync(`${process.env.POC_FAULT_FILE}.redeliver`) && lastObserved && number > lastObserved.blockNumber) {
      if (await project(lastObserved, ponderStore(context)) !== 'duplicate') throw new Error('Cross-block duplicate applied');
      writeFileSync(`${process.env.POC_FAULT_FILE}.duplicate`, number.toString());
    }
    await context.db.insert(checkpoint).values({ id: 1, number, hash, timestamp }).onConflictDoUpdate({ number, hash, timestamp });
  });
}
