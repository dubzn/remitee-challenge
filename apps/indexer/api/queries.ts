import type pg from 'pg';
import type { Settings } from '../config.ts';
import { queryObservation } from '../read-model.ts';
import type { ReadTrace } from '../read-model.ts';
import { publicEscrow, publicObservation } from './domain.ts';
import type { DataQuery } from './domain.ts';

export async function readEscrows(config: Settings, pool: pg.Pool, query: DataQuery, trace?: ReadTrace) {
  const result = await queryObservation(config, pool, async (client, now) => {
    const values: (string | number)[] = [];
    const clauses: string[] = [];
    const parameter = (value: string | number) => { values.push(value); return `$${values.length}`; };
    if (query.kind === 'detail') clauses.push(`id=${parameter(query.id)}::numeric`);
    else {
      if (query.sender) clauses.push(`sender=${parameter(query.sender)}`);
      if (query.beneficiary) clauses.push(`beneficiary=${parameter(query.beneficiary)}`);
      if (query.status === 'Pending' || query.status === 'ExpiredRecoverable') {
        clauses.push("status='Pending'");
        clauses.push(`expires_at ${query.status === 'Pending' ? '>' : '<='} ${parameter(now.toString())}::numeric`);
      } else if (query.status) clauses.push(`status=${parameter(query.status)}`);
    }
    const limit = query.kind === 'detail' ? '1' : parameter(query.limit + 1);
    const offset = query.kind === 'detail' ? '0' : parameter(query.offset);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = (await client.query(
      `SELECT id,sender,beneficiary,token,amount,created_at,cancel_deadline,expires_at,status,creation_transaction_hash,resolution_transaction_hash
       FROM "${config.schema}".escrows ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
      values,
    )).rows as Record<string, unknown>[];
    return { rows, now };
  }, trace);
  const observation = publicObservation(result.observation);
  if (query.kind === 'detail') {
    const row = result.data.rows[0];
    return row ? { status: 200, body: { escrow: publicEscrow(row, result.data.now), observation } }
      : { status: 404, body: { error: { code: 'escrow_not_found', message: 'Escrow is absent from the admitted projection.' }, observation } };
  }
  return {
    status: 200,
    body: {
      items: result.data.rows.slice(0, query.limit).map(row => publicEscrow(row, result.data.now)),
      page: { limit: query.limit, offset: query.offset, hasMore: result.data.rows.length > query.limit },
      observation,
    },
  };
}
