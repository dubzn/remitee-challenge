// Pure projection rules: no SQL, network calls, or framework imports.
export type Hex = `0x${string}`;
export type Status = 'Pending' | 'CancelledBySender' | 'Released' | 'Rejected' | 'Expired';
export type EventName =
  | 'EscrowCreated'
  | 'EscrowCancelled'
  | 'EscrowReleased'
  | 'EscrowRejected'
  | 'EscrowExpired';
export type EscrowRecord = {
  id: bigint;
  sender: Hex;
  beneficiary: Hex;
  token: Hex;
  amount: bigint;
  createdAt: bigint;
  cancelDeadline: bigint;
  expiresAt: bigint;
  status: string;
  creationTransactionHash: Hex;
  creationBlockNumber: bigint;
  creationBlockHash: Hex;
  resolutionTransactionHash: Hex | null;
  resolutionBlockNumber: bigint | null;
  resolutionBlockHash: Hex | null;
};
export type EventRecord = {
  transactionHash: Hex;
  logIndex: number;
  transactionIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
  escrowId: bigint;
  name: EventName;
  actor: Hex;
  payload: string;
  data: Hex;
  topics: readonly string[];
};
export type Observation = EventRecord & {
  created?: Omit<
    EscrowRecord,
    | 'status'
    | 'creationTransactionHash'
    | 'creationBlockNumber'
    | 'creationBlockHash'
    | 'resolutionTransactionHash'
    | 'resolutionBlockNumber'
    | 'resolutionBlockHash'
  >;
};
export interface ProjectionStore {
  findEvent(event: EventRecord): Promise<EventRecord | null>;
  appendEvent(event: EventRecord): Promise<void>;
  findEscrow(id: bigint): Promise<EscrowRecord | null>;
  createEscrow(record: EscrowRecord): Promise<void>;
  resolveEscrow(
    id: bigint,
    fields: Pick<
      EscrowRecord,
      'status' | 'resolutionTransactionHash' | 'resolutionBlockNumber' | 'resolutionBlockHash'
    >,
  ): Promise<void>;
}
const outcomes: Partial<Record<EventName, Status>> = {
  EscrowCancelled: 'CancelledBySender',
  EscrowReleased: 'Released',
  EscrowRejected: 'Rejected',
  EscrowExpired: 'Expired',
};
export async function project(observation: Observation, store: ProjectionStore) {
  const { created, ...event } = observation;
  const existing = await store.findEvent(event);
  if (existing) {
    for (const key of Object.keys(event) as (keyof EventRecord)[]) {
      const equal =
        key === 'topics'
          ? JSON.stringify(existing[key]) === JSON.stringify(event[key])
          : existing[key] === event[key];
      if (!equal) throw new Error('Conflicting event identity');
    }
    return 'duplicate';
  }
  const current = await store.findEscrow(event.escrowId);
  if (event.name === 'EscrowCreated') {
    if (
      !created ||
      current ||
      created.id !== event.escrowId ||
      created.sender !== event.actor ||
      created.amount <= 0n
    )
      throw new Error('Invalid escrow creation');
    await store.appendEvent(event);
    await store.createEscrow({
      ...created,
      status: 'Pending',
      creationTransactionHash: event.transactionHash,
      creationBlockNumber: event.blockNumber,
      creationBlockHash: event.blockHash,
      resolutionTransactionHash: null,
      resolutionBlockNumber: null,
      resolutionBlockHash: null,
    });
  } else {
    const outcome = outcomes[event.name];
    const beneficiaryAction = event.name === 'EscrowReleased' || event.name === 'EscrowRejected';
    if (
      !current ||
      current.status !== 'Pending' ||
      !outcome ||
      event.actor !== (beneficiaryAction ? current.beneficiary : current.sender)
    )
      throw new Error('Invalid escrow transition');
    await store.appendEvent(event);
    await store.resolveEscrow(event.escrowId, {
      status: outcome,
      resolutionTransactionHash: event.transactionHash,
      resolutionBlockNumber: event.blockNumber,
      resolutionBlockHash: event.blockHash,
    });
  }
  return 'applied';
}
