import { onchainTable, primaryKey } from 'ponder';

export const checkpoint = onchainTable('checkpoint', (t) => ({
  id: t.integer().primaryKey(),
  number: t.bigint().notNull(),
  hash: t.hex().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const escrow = onchainTable('escrows', (t) => ({
  id: t.bigint().primaryKey(),
  sender: t.hex().notNull(),
  beneficiary: t.hex().notNull(),
  token: t.hex().notNull(),
  amount: t.bigint().notNull(),
  createdAt: t.bigint().notNull(),
  cancelDeadline: t.bigint().notNull(),
  expiresAt: t.bigint().notNull(),
  status: t.text().notNull(),
}));

export const journal = onchainTable('journal', (t) => ({
  transactionHash: t.hex().notNull(),
  logIndex: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
  blockHash: t.hex().notNull(),
  escrowId: t.bigint().notNull(),
  name: t.text().notNull(),
  payload: t.text().notNull(),
}), (t) => ({ pk: primaryKey({ columns: [t.transactionHash, t.logIndex] }) }));
