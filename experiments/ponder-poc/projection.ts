// Domain projection: no database client, SQL, or Ponder imports.
export type EscrowRecord = {
  id: bigint; sender: `0x${string}`; beneficiary: `0x${string}`; token: `0x${string}`;
  amount: bigint; createdAt: bigint; cancelDeadline: bigint; expiresAt: bigint; status: string;
};
export type ObservedEvent = {
  name: string; transactionHash: `0x${string}`; logIndex: number;
  blockNumber: bigint; blockHash: `0x${string}`; escrowId: bigint; payload: string;
  created?: EscrowRecord; outcome?: string;
};
export interface ProjectionStore {
  findEvent(event: ObservedEvent): Promise<Pick<ObservedEvent, 'blockNumber' | 'blockHash' | 'escrowId' | 'name' | 'payload'> | null>;
  appendEvent(event: ObservedEvent): Promise<void>;
  createEscrow(record: EscrowRecord): Promise<void>;
  resolveEscrow(id: bigint, outcome: string): Promise<void>;
}

export async function project(event: ObservedEvent, store: ProjectionStore, afterJournal?: () => Promise<void>) {
  const existing = await store.findEvent(event);
  if (existing) {
    for (const key of ['blockNumber', 'blockHash', 'escrowId', 'name', 'payload'] as const) {
      if (existing[key] !== event[key]) throw new Error(`Conflicting event identity: ${key}`);
    }
    return 'duplicate';
  }
  await store.appendEvent(event);
  await afterJournal?.();
  if (event.created) await store.createEscrow(event.created);
  else if (event.outcome) await store.resolveEscrow(event.escrowId, event.outcome);
  else throw new Error('Missing event transition');
  return 'applied';
}
