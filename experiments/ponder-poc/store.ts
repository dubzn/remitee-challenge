import type { Context } from 'ponder:registry';
import { escrow, journal } from 'ponder:schema';
import type { ProjectionStore } from './projection';

// Ponder owns this transaction and rollback history. Never open a second writer.
export function ponderStore(context: Context): ProjectionStore {
  return {
    findEvent: (event) => context.db.find(journal, { transactionHash: event.transactionHash, logIndex: event.logIndex }),
    async appendEvent({ created: _created, outcome: _outcome, ...event }) {
      await context.db.insert(journal).values(event);
    },
    async createEscrow(record) { await context.db.insert(escrow).values(record); },
    async resolveEscrow(id, outcome) {
      const current = await context.db.find(escrow, { id });
      if (!current || current.status !== 'Pending') throw new Error('Invalid escrow transition');
      await context.db.update(escrow, { id }).set({ status: outcome });
    },
  };
}
