import type pg from 'pg';
import type { Settings } from '../config.ts';
import { queryObservation } from '../read-model.ts';
import type { DataQuery } from './domain.ts';
import { publicEscrow, publicObservation } from './domain.ts';

function escrowSelect(schema: string, query: DataQuery, headTime: bigint) {
  const values: (string | number)[] = [];
  const clauses: string[] = [];
  const parameter = (value: string | number) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (query.kind === 'detail') {
    clauses.push(`id=${parameter(query.id)}::numeric`);
  } else {
    if (query.sender) clauses.push(`sender=${parameter(query.sender)}`);
    if (query.beneficiary) clauses.push(`beneficiary=${parameter(query.beneficiary)}`);
    if (query.status === 'Pending' || query.status === 'ExpiredRecoverable') {
      clauses.push("status='Pending'");
      const comparison = query.status === 'Pending' ? '>' : '<=';
      clauses.push(`expires_at ${comparison} ${parameter(headTime.toString())}::numeric`);
    } else if (query.status) {
      clauses.push(`status=${parameter(query.status)}`);
    }
  }

  const limit = query.kind === 'detail' ? '1' : parameter(query.limit + 1);
  const offset = query.kind === 'detail' ? '0' : parameter(query.offset);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return {
    text: `SELECT id, sender, beneficiary, token, amount,
                  created_at, cancel_deadline, expires_at, status,
                  creation_transaction_hash, resolution_transaction_hash
           FROM "${schema}".escrows
           ${where}
           ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
    values,
  };
}

function escrowResponse(
  query: DataQuery,
  rows: Record<string, unknown>[],
  headTime: bigint,
  observation: ReturnType<typeof publicObservation>,
) {
  if (query.kind === 'detail') {
    const row = rows[0];
    if (row) {
      return { status: 200, body: { escrow: publicEscrow(row, headTime), observation } };
    }
    return {
      status: 404,
      body: {
        error: { code: 'escrow_not_found', message: 'Escrow was not found in the indexed blocks.' },
        observation,
      },
    };
  }
  return {
    status: 200,
    body: {
      items: rows.slice(0, query.limit).map((row) => publicEscrow(row, headTime)),
      page: { limit: query.limit, offset: query.offset, hasMore: rows.length > query.limit },
      observation,
    },
  };
}

export async function readEscrows(config: Settings, pool: pg.Pool, query: DataQuery) {
  const result = await queryObservation(config, pool, async (client, headTime) => {
    const selection = escrowSelect(config.schema, query, headTime);
    const selected = await client.query(selection.text, selection.values);
    return { rows: selected.rows as Record<string, unknown>[], headTime };
  });

  return escrowResponse(
    query,
    result.data.rows,
    result.data.headTime,
    publicObservation(result.observation),
  );
}
