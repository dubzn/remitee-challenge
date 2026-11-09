import type { Context } from 'ponder:registry';
import { escrow, journal } from 'ponder:schema';
import type { EventRecord, ProjectionStore } from './projection.ts';
// All writes belong to Ponder's current unit of work and rollback history.
export function ponderStore(context: Context): ProjectionStore {
  return {
    async findEvent(event) {
      return (await context.db.find(journal, {
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
      })) as EventRecord | null;
    },
    async appendEvent(event) {
      await context.db.insert(journal).values({ ...event, topics: [...event.topics] });
    },
    findEscrow: (id) => context.db.find(escrow, { id }),
    async createEscrow(record) {
      await context.db.insert(escrow).values(record);
    },
    async resolveEscrow(id, fields) {
      await context.db.update(escrow, { id }).set(fields);
    },
  };
}
