import type pg from 'pg';
import type { Settings } from '../config.ts';
import type { ReadTrace } from '../read-model.ts';
import {
  isMissingTableError,
  newReadTrace,
  queryObservation,
  readCheckpoint,
} from '../read-model.ts';
import { publicBlock, publicObservation } from './domain.ts';
import { unavailabilityReason } from './errors.ts';

export async function engineState(config: Settings) {
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/ready`, {
      signal: AbortSignal.timeout(1_000),
    });
    await response.body?.cancel();

    if (response.status === 200) return { status: 'ready' as const, reason: null };
    if (response.status === 503) {
      return { status: 'catching_up' as const, reason: 'indexer_not_ready' };
    }
  } catch {
    // An unreachable engine is distinct from one still processing its history.
  }
  return { status: 'unavailable' as const, reason: 'indexer_unavailable' };
}

async function probeUnobservedDatabase(config: Settings, pool: pg.Pool, trace: ReadTrace) {
  if (trace.database !== 'unknown') return;

  // Early RPC failure can prevent the normal read from reaching PostgreSQL.
  try {
    trace.checkpoint = await readCheckpoint(pool, config);
    trace.database = 'up';
    trace.scopeMatched = trace.checkpoint?.scope_key === config.scopeKey;
  } catch (error) {
    trace.database = isMissingTableError(error) ? 'up' : 'down';
  }
}

function indexerStatus(
  engine: Awaited<ReturnType<typeof engineState>>,
  trace: ReadTrace,
  startupMinBlock: bigint,
) {
  if (engine.status !== 'ready') return engine.status;
  if (!trace.scopeMatched || !trace.checkpoint) return 'unknown';

  try {
    return BigInt(trace.checkpoint.number) >= startupMinBlock ? 'ready' : 'catching_up';
  } catch {
    return 'unknown';
  }
}

function diagnosticProgress(config: Settings, trace: ReadTrace) {
  let head: ReturnType<typeof publicBlock> | null = null;
  let indexed: ReturnType<typeof publicBlock> | null = null;

  // Partial diagnostics never count as a verified observation.
  try {
    if (trace.head) {
      head = publicBlock({
        number: BigInt(trace.head.number),
        hash: trace.head.hash,
        timestamp: BigInt(trace.head.timestamp),
      });
    }
  } catch {
    // A malformed head stays unavailable instead of using a remembered value.
  }
  try {
    if (trace.checkpoint) indexed = publicBlock(trace.checkpoint);
  } catch {
    // The checkpoint may be unavailable independently of the RPC head.
  }

  let headLag: string | null = null;
  let eligibleBacklog: string | null = null;
  if (head && indexed && trace.scopeMatched && trace.identityValidated) {
    const lag = BigInt(head.number) - BigInt(indexed.number);
    const eligible = BigInt(head.number) - BigInt(config.confirmationDelay);
    // Diagnostics clamp the height as specified. This does not make a
    // checkpoint eligible for a successful read when head < delay.
    const backlog = (eligible < 0n ? 0n : eligible) - BigInt(indexed.number);
    if (lag >= 0n) headLag = lag.toString();
    if (backlog >= 0n) eligibleBacklog = backlog.toString();
  }

  return {
    observedHead: head,
    indexedThrough: indexed,
    confirmationDelay: config.confirmationDelay,
    reorgWindowSeconds: config.reorgWindow,
    headLag,
    eligibleBacklog,
  };
}

export async function health(config: Settings, pool: pg.Pool) {
  const trace = newReadTrace();
  let reason: string | null = null;
  let observation: ReturnType<typeof publicObservation> | null = null;

  try {
    const result = await queryObservation(config, pool, async () => null, trace);
    observation = publicObservation(result.observation);
  } catch (error) {
    reason = unavailabilityReason(error);
  }

  if (reason === 'rpc_unavailable') {
    trace.rpc = 'down';
    trace.head = null;
    trace.identityValidated = false;
  }
  await probeUnobservedDatabase(config, pool, trace);

  const engine = await engineState(config);
  reason ??= engine.reason;
  const components = {
    rpc: trace.rpc,
    database: trace.database,
    indexer: indexerStatus(engine, trace, config.startupMinBlock),
  };

  if (reason) {
    return {
      status: 503,
      body: {
        ready: false,
        components,
        observation: null,
        reason,
        diagnostics: diagnosticProgress(config, trace),
      },
    };
  }
  return { status: 200, body: { ready: true, components, observation } };
}
