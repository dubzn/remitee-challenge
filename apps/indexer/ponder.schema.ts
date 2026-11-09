import { index, onchainTable, primaryKey } from 'ponder';
export const checkpoint = onchainTable('checkpoint', (t) => ({
  id: t.integer().primaryKey(),
  scopeKey: t.text().notNull(),
  number: t.bigint().notNull(),
  hash: t.hex().notNull(),
  timestamp: t.bigint().notNull(),
}));
export const escrow = onchainTable(
  'escrows',
  (t) => ({
    id: t.bigint().primaryKey(),
    sender: t.hex().notNull(),
    beneficiary: t.hex().notNull(),
    token: t.hex().notNull(),
    amount: t.bigint().notNull(),
    createdAt: t.bigint().notNull(),
    cancelDeadline: t.bigint().notNull(),
    expiresAt: t.bigint().notNull(),
    status: t.text().notNull(),
    creationTransactionHash: t.hex().notNull(),
    creationBlockNumber: t.bigint().notNull(),
    creationBlockHash: t.hex().notNull(),
    resolutionTransactionHash: t.hex(),
    resolutionBlockNumber: t.bigint(),
    resolutionBlockHash: t.hex(),
  }),
  (t) => ({ sender: index().on(t.sender, t.id), beneficiary: index().on(t.beneficiary, t.id) }),
);
export const journal = onchainTable(
  'journal',
  (t) => ({
    transactionHash: t.hex().notNull(),
    logIndex: t.integer().notNull(),
    transactionIndex: t.integer().notNull(),
    blockNumber: t.bigint().notNull(),
    blockHash: t.hex().notNull(),
    escrowId: t.bigint().notNull(),
    name: t.text().notNull(),
    actor: t.hex().notNull(),
    payload: t.text().notNull(),
    data: t.hex().notNull(),
    topics: t.text().array().notNull(),
  }),
  (t) => ({ pk: primaryKey({ columns: [t.transactionHash, t.logIndex] }) }),
);
