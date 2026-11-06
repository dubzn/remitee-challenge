import { ponder } from 'ponder:registry';
import type { Context } from 'ponder:registry';
import { checkpoint } from 'ponder:schema';
import type { Hex } from 'viem';
import { settings } from '../config.ts';
import { project } from '../projection.ts';
import type { EventName, Observation } from '../projection.ts';
import { ponderStore } from '../store.ts';
const config = settings();
type Envelope = {
  args: { id: bigint } & Record<string, unknown>;
  transaction: { hash: Hex; transactionIndex: number };
  log: { logIndex: number; data: Hex; topics: readonly Hex[] };
  block: { number: bigint; hash: Hex };
};
const lower = (address: Hex) => address.toLowerCase() as Hex;
async function consume(
  name: EventName,
  event: Envelope,
  context: Context,
  actor: Hex,
  created?: Observation['created'],
) {
  const args = Object.fromEntries(
    Object.entries(event.args).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? value.toString() : typeof value === 'string' ? value.toLowerCase() : value,
    ]),
  );
  await project(
    {
      name,
      actor: lower(actor),
      escrowId: event.args.id,
      transactionHash: event.transaction.hash,
      transactionIndex: event.transaction.transactionIndex,
      logIndex: event.log.logIndex,
      blockNumber: event.block.number,
      blockHash: event.block.hash,
      data: event.log.data,
      topics: event.log.topics,
      payload: JSON.stringify(args),
      created,
    },
    ponderStore(context),
  );
}
ponder.on('Escrow:EscrowCreated', async ({ event, context }) =>
  consume('EscrowCreated', event, context, event.args.sender, {
    ...event.args,
    sender: lower(event.args.sender),
    beneficiary: lower(event.args.beneficiary),
    token: lower(event.args.token),
  }),
);
ponder.on('Escrow:EscrowCancelled', async ({ event, context }) =>
  consume('EscrowCancelled', event, context, event.args.sender),
);
ponder.on('Escrow:EscrowReleased', async ({ event, context }) =>
  consume('EscrowReleased', event, context, event.args.beneficiary),
);
ponder.on('Escrow:EscrowRejected', async ({ event, context }) =>
  consume('EscrowRejected', event, context, event.args.beneficiary),
);
ponder.on('Escrow:EscrowExpired', async ({ event, context }) =>
  consume('EscrowExpired', event, context, event.args.sender),
);
ponder.on('Progress:block', async ({ event, context }) => {
  const { number, hash, timestamp } = event.block;
  await context.db
    .insert(checkpoint)
    .values({ id: 1, scopeKey: config.scopeKey, number, hash, timestamp })
    .onConflictDoUpdate({ scopeKey: config.scopeKey, number, hash, timestamp });
});
