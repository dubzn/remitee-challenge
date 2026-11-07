import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import type { Settings } from '../config.ts';
import { newReadTrace, queryObservation, readCheckpoint } from '../read-model.ts';
import type { ReadTrace } from '../read-model.ts';
import { ObservationError } from '../rpc.ts';
import { InputError, parseRequest, publicBlock, publicObservation } from './domain.ts';
import { readEscrows } from './queries.ts';

export { businessPaths } from './domain.ts';
export const unavailabilityReasons = [
  'rpc_unavailable', 'database_unavailable', 'indexer_unavailable', 'indexer_not_ready',
  'startup_catchup', 'checkpoint_unavailable', 'checkpoint_not_eligible', 'checkpoint_hash_mismatch',
  'deployment_identity_mismatch', 'persisted_scope_mismatch', 'chain_changed_during_read', 'observation_unavailable',
] as const;
const reasons = new Set<string>(unavailabilityReasons);
const reasonOf = (error: unknown) => error instanceof ObservationError && reasons.has(error.code) ? error.code : 'observation_unavailable';
async function engineState(config: Settings) {
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/ready`, { signal: AbortSignal.timeout(1_000) });
    await response.body?.cancel();
    if (response.status === 200) return { status: 'ready' as const, reason: null };
    if (response.status === 503) return { status: 'catching_up' as const, reason: 'indexer_not_ready' };
  } catch {}
  return { status: 'unavailable' as const, reason: 'indexer_unavailable' };
}
function diagnosticProgress(config: Settings, trace: ReadTrace) {
  let head: ReturnType<typeof publicBlock> | null = null;
  let indexed: ReturnType<typeof publicBlock> | null = null;
  try {
    if (trace.head) head = publicBlock({ number: BigInt(trace.head.number), hash: trace.head.hash, timestamp: BigInt(trace.head.timestamp) });
  } catch {}
  try { if (trace.checkpoint) indexed = publicBlock(trace.checkpoint); } catch {}
  let headLag: string | null = null;
  let eligibleBacklog: string | null = null;
  if (head && indexed && trace.scopeMatched && trace.identityValidated) {
    const lag = BigInt(head.number) - BigInt(indexed.number);
    const eligible = BigInt(head.number) - BigInt(config.confirmationDelay);
    const backlog = (eligible < 0n ? 0n : eligible) - BigInt(indexed.number);
    if (lag >= 0n) headLag = lag.toString();
    if (backlog >= 0n) eligibleBacklog = backlog.toString();
  }
  return {
    observedHead: head, indexedThrough: indexed,
    confirmationDelay: config.confirmationDelay, reorgWindowSeconds: config.reorgWindow,
    headLag, eligibleBacklog,
  };
}
export async function health(config: Settings, pool: pg.Pool) {
  const trace = newReadTrace();
  let reason: string | null = null;
  let observation: ReturnType<typeof publicObservation> | null = null;
  try {
    const result = await queryObservation(config, pool, async () => null, trace);
    observation = publicObservation(result.observation);
  } catch (error) { reason = reasonOf(error); }
  if (reason === 'rpc_unavailable') {
    trace.rpc = 'down'; trace.head = null; trace.identityValidated = false;
  }
  // A failed early RPC check must not invent a database component result.
  if (trace.database === 'unknown') {
    try {
      trace.checkpoint = await readCheckpoint(pool, config);
      trace.database = 'up';
      trace.scopeMatched = trace.checkpoint?.scope_key === config.scopeKey;
    } catch (error) {
      trace.database = (error as { code?: string }).code === '42P01' ? 'up' : 'down';
    }
  }
  const engine = await engineState(config);
  if (!reason) reason = engine.reason;
  let indexer: 'ready' | 'catching_up' | 'unavailable' | 'unknown' = engine.status;
  if (engine.status === 'ready') {
    indexer = 'unknown';
    if (trace.scopeMatched && trace.checkpoint) {
      try { indexer = BigInt(trace.checkpoint.number) >= config.startupMinBlock ? 'ready' : 'catching_up'; }
      catch {}
    }
  }
  const components = { rpc: trace.rpc, database: trace.database, indexer };
  return reason ? {
    status: 503,
    body: { ready: false, components, observation: null, reason, diagnostics: diagnosticProgress(config, trace) },
  } : { status: 200, body: { ready: true, components, observation } };
}
function json(response: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(data) });
  response.end(data);
}
export function apiServer(config: Settings, pool: pg.Pool, specPath: string) {
  const specification = readFileSync(specPath);
  return createServer({ requestTimeout: 10_000, headersTimeout: 10_000 }, async (request, response) => {
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET');
      json(response, 405, { error: { code: 'method_not_allowed', message: 'Use GET.' } });
      return;
    }
    try {
      const query = parseRequest(request.url ?? '/');
      if (query.kind === 'spec') {
        response.writeHead(200, { 'content-type': 'application/yaml; charset=utf-8', 'content-length': specification.length });
        response.end(specification);
      } else if (query.kind === 'not_found') {
        json(response, 404, { error: { code: 'route_not_found', message: 'Unknown route.' } });
      } else if (query.kind === 'health') {
        const result = await health(config, pool);
        json(response, result.status, result.body);
      } else {
        const result = await readEscrows(config, pool, query);
        const engine = await engineState(config);
        if (engine.reason) throw new ObservationError(engine.reason);
        json(response, result.status, result.body);
      }
    } catch (error) {
      if (error instanceof InputError) json(response, 400, { error: { code: 'invalid_request', message: error.message, parameter: error.parameter } });
      else json(response, 503, { error: { code: 'observation_unavailable', message: 'A verified read is currently unavailable.', reason: reasonOf(error) } });
    }
  });
}
