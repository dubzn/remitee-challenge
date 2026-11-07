import type { Observation } from '../read-model.ts';

export const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
export const statuses = ['Pending', 'CancelledBySender', 'Released', 'Rejected', 'Expired'] as const;
export type Status = (typeof statuses)[number];
export type EffectiveStatus = Status | 'ExpiredRecoverable';
export const effectiveStatuses: readonly string[] = [...statuses, 'ExpiredRecoverable'];
const canonicalDecimal = /^(0|[1-9][0-9]*)$/;
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
export const routes = { detail: '/escrows/{id}', list: '/escrows', health: '/health' } as const;
export const businessPaths = Object.values(routes);
const detailPattern = new RegExp(`^${routes.detail.replace('{id}', '([^/]+)')}$`);

export class InputError extends Error {
  readonly parameter: string;
  constructor(parameter: string) {
    super('Request contains invalid or unsupported input.');
    this.parameter = parameter;
  }
}
export type ListQuery = {
  kind: 'list';
  sender?: string;
  beneficiary?: string;
  status?: EffectiveStatus;
  limit: number;
  offset: number;
};
export type DataQuery = ListQuery | { kind: 'detail'; id: string };
export type ApiRequest = DataQuery | { kind: 'health' } | { kind: 'spec' } | { kind: 'not_found' };

function inputInteger(value: string, maximum: bigint, name: string, positive = false) {
  if (value.length > 78 || !canonicalDecimal.test(value)) throw new InputError(name);
  const integer = BigInt(value);
  if (integer > maximum || (positive && integer === 0n)) throw new InputError(name);
  return integer;
}
function queryParameters(raw: string, allowed: readonly string[]) {
  const result = new Map<string, string>();
  if (!raw) return result;
  for (const pair of raw.split('&')) {
    const separator = pair.indexOf('=');
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent((separator < 0 ? pair : pair.slice(0, separator)).replace(/\+/g, ' '));
      value = decodeURIComponent((separator < 0 ? '' : pair.slice(separator + 1)).replace(/\+/g, ' '));
    } catch {
      throw new InputError('query');
    }
    if (!allowed.includes(key) || !value || result.has(key)) throw new InputError(allowed.includes(key) ? key : 'query');
    result.set(key, value);
  }
  return result;
}
export function parseRequest(target: string): ApiRequest {
  const split = target.indexOf('?');
  const path = split < 0 ? target : target.slice(0, split);
  const rawQuery = split < 0 ? '' : target.slice(split + 1);
  if (path === '/openapi.yaml') {
    queryParameters(rawQuery, []);
    return { kind: 'spec' };
  }
  if (path === routes.health) {
    queryParameters(rawQuery, []);
    return { kind: 'health' };
  }
  const detail = detailPattern.exec(path);
  if (detail) {
    queryParameters(rawQuery, []);
    let id: string;
    try { id = decodeURIComponent(detail[1]!); } catch { throw new InputError('id'); }
    inputInteger(id, UINT256_MAX, 'id', true);
    return { kind: 'detail', id };
  }
  if (path !== routes.list) return { kind: 'not_found' };
  const query = queryParameters(rawQuery, ['sender', 'beneficiary', 'status', 'limit', 'offset']);
  const parsed: ListQuery = {
    kind: 'list',
    limit: Number(inputInteger(query.get('limit') ?? '20', 100n, 'limit', true)),
    offset: Number(inputInteger(query.get('offset') ?? '0', 10_000n, 'offset')),
  };
  for (const name of ['sender', 'beneficiary'] as const) {
    const value = query.get(name);
    if (value !== undefined) {
      if (!addressPattern.test(value)) throw new InputError(name);
      parsed[name] = value.toLowerCase();
    }
  }
  const status = query.get('status');
  if (status !== undefined) {
    if (!effectiveStatuses.includes(status)) throw new InputError('status');
    parsed.status = status as EffectiveStatus;
  }
  return parsed;
}

export function decimal(value: unknown, maximum = UINT256_MAX, positive = false): string {
  if (typeof value !== 'string' && typeof value !== 'bigint' && !(typeof value === 'number' && Number.isSafeInteger(value)))
    throw new Error('Invalid integer representation');
  const text = String(value);
  if (text.length > 78 || !canonicalDecimal.test(text)) throw new Error('Invalid integer representation');
  const integer = BigInt(text);
  if (integer > maximum || (positive && integer === 0n)) throw new Error('Integer out of range');
  return text;
}
function hex(value: unknown, pattern: RegExp) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Invalid hexadecimal value');
  return value.toLowerCase();
}
export function eligibility(status: Status, cancelDeadline: bigint, expiresAt: bigint, now: bigint) {
  const pending = status === 'Pending';
  return {
    effectiveStatus: pending && now >= expiresAt ? 'ExpiredRecoverable' as const : status,
    canCancel: pending && now < cancelDeadline,
    canRecover: pending && now >= expiresAt,
  };
}
export function publicEscrow(row: Record<string, unknown>, now: bigint) {
  if (!statuses.includes(row.status as Status)) throw new Error('Invalid recorded status');
  const status = row.status as Status;
  const createdAt = decimal(row.created_at, UINT64_MAX);
  const cancelDeadline = decimal(row.cancel_deadline, UINT64_MAX);
  const expiresAt = decimal(row.expires_at, UINT64_MAX);
  if (BigInt(createdAt) > BigInt(cancelDeadline) || BigInt(cancelDeadline) >= BigInt(expiresAt))
    throw new Error('Invalid deadlines');
  const resolution = row.resolution_transaction_hash === null ? null : hex(row.resolution_transaction_hash, hashPattern);
  if ((resolution === null) !== (status === 'Pending')) throw new Error('Invalid resolution trace');
  return {
    id: decimal(row.id, UINT256_MAX, true),
    sender: hex(row.sender, addressPattern),
    beneficiary: hex(row.beneficiary, addressPattern),
    token: hex(row.token, addressPattern),
    amount: decimal(row.amount, UINT256_MAX, true),
    createdAt, cancelDeadline, expiresAt,
    onChainStatus: status,
    ...eligibility(status, BigInt(cancelDeadline), BigInt(expiresAt), now),
    creationTxHash: hex(row.creation_transaction_hash, hashPattern),
    resolutionTxHash: resolution,
  };
}
export function publicObservation(observation: Observation) {
  return {
    ...observation,
    chainId: decimal(observation.chainId, UINT256_MAX, true),
    contractAddress: hex(observation.contractAddress, addressPattern),
    observedHead: publicBlock(observation.observedHead),
    indexedThrough: publicBlock(observation.indexedThrough),
    headLag: decimal(observation.headLag),
    eligibleBacklog: decimal(observation.eligibleBacklog),
  };
}
export function publicBlock(block: { number: unknown; hash: unknown; timestamp: unknown }) {
  return { number: decimal(block.number), hash: hex(block.hash, hashPattern), timestamp: decimal(block.timestamp, UINT64_MAX) };
}
