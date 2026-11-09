import pg from 'pg';
import type { Settings } from './config.ts';
import type { Header } from './rpc.ts';
import { chainReader, ObservationError } from './rpc.ts';

type ChainReader = ReturnType<typeof chainReader>;
type SnapshotQuery<T> = (client: pg.PoolClient, headTime: bigint) => Promise<T>;

export type Checkpoint = {
  scope_key: string;
  number: string;
  hash: string;
  timestamp: string;
};
// Facts reached during this read, for partial health diagnostics. Final chain
// rechecks validate the captured facts without replacing them in this trace.
export type ReadTrace = {
  head: Header | null;
  checkpoint: Checkpoint | null;
  rpc: 'up' | 'down' | 'unknown';
  database: 'up' | 'down' | 'unknown';
  scopeMatched: boolean;
};
export type Observation = {
  chainId: number;
  contractAddress: string;
  observedHead: { number: string; hash: string; timestamp: string };
  indexedThrough: { number: string; hash: string; timestamp: string };
  confirmationDelay: number;
  reorgWindowSeconds: number;
  headLag: string;
  eligibleBacklog: string;
};

export const newReadTrace = (): ReadTrace => ({
  head: null,
  checkpoint: null,
  rpc: 'unknown',
  database: 'unknown',
  scopeMatched: false,
});

export function isMissingTableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01';
}

export function connection(config: Settings) {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: 3,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 2_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
  });
}

export async function validateScope(config: Settings, pool: pg.Pool, fresh = false) {
  const table = await pool.query('SELECT to_regclass($1) AS table', [
    `${config.schema}.checkpoint`,
  ]);
  const present = table.rows[0].table;
  if (fresh && present) throw new ObservationError('replay_requires_new_schema');
  if (!present) return 0n;

  const result = await pool.query(
    `SELECT scope_key, number::text FROM "${config.schema}".checkpoint WHERE id=1`,
  );
  const checkpoint = result.rows[0] as Pick<Checkpoint, 'scope_key' | 'number'> | undefined;
  if (checkpoint && checkpoint.scope_key !== config.scopeKey) {
    throw new ObservationError('persisted_scope_mismatch');
  }
  if (!checkpoint) {
    const count = await pool.query(
      `SELECT (SELECT count(*) FROM "${config.schema}".journal)+(SELECT count(*) FROM "${config.schema}".escrows) AS n`,
    );
    if (BigInt(count.rows[0].n) !== 0n) throw new ObservationError('missing_scope_checkpoint');
  }
  return checkpoint ? BigInt(checkpoint.number) : 0n;
}

export async function readCheckpoint(client: pg.Pool | pg.PoolClient, config: Settings) {
  const result = await client.query(
    `SELECT scope_key, number::text, hash, timestamp::text FROM "${config.schema}".checkpoint WHERE id=1`,
  );
  return (result.rows[0] as Checkpoint | undefined) ?? null;
}

async function readValidHead(chain: ChainReader, trace: ReadTrace): Promise<Header> {
  const head = await chain.block('latest');
  const validHead =
    head &&
    typeof head.number === 'string' &&
    head.number.length <= 66 &&
    /^0x[0-9a-fA-F]+$/.test(head.number) &&
    typeof head.timestamp === 'string' &&
    head.timestamp.length <= 18 &&
    /^0x[0-9a-fA-F]+$/.test(head.timestamp) &&
    typeof head.hash === 'string' &&
    /^0x[0-9a-fA-F]{64}$/.test(head.hash);

  if (!validHead) {
    trace.rpc = 'down';
    throw new ObservationError('rpc_unavailable');
  }
  trace.rpc = 'up';
  trace.head = head;
  return head;
}

async function readSnapshot<T>(
  config: Settings,
  pool: pg.Pool,
  query: SnapshotQuery<T>,
  headTime: bigint,
  trace: ReadTrace,
) {
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
    trace.database = 'up';
  } catch {
    trace.database = 'down';
    throw new ObservationError('database_unavailable');
  }

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const checkpoint = await readCheckpoint(client, config);
    if (!checkpoint) throw new ObservationError('checkpoint_unavailable');
    trace.checkpoint = checkpoint;
    const data = await query(client, headTime);
    await client.query('COMMIT');
    return { data, checkpoint };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof ObservationError) throw error;
    if (isMissingTableError(error)) {
      throw new ObservationError('checkpoint_unavailable');
    }
    trace.database = 'down';
    throw new ObservationError('database_unavailable');
  } finally {
    client.release();
  }
}

function validateCheckpoint(
  config: Settings,
  checkpoint: Checkpoint,
  headNumber: bigint,
  trace: ReadTrace,
) {
  if (checkpoint.scope_key !== config.scopeKey)
    throw new ObservationError('persisted_scope_mismatch');
  trace.scopeMatched = true;

  const indexed = BigInt(checkpoint.number);
  if (indexed < config.startupMinBlock) throw new ObservationError('startup_catchup');

  // Keep this subtraction unclamped: no block is eligible when head < delay.
  const eligible = headNumber - BigInt(config.confirmationDelay);
  if (indexed > eligible) throw new ObservationError('checkpoint_not_eligible');
  return { indexed, eligible };
}

async function assertChainUnchanged(chain: ChainReader, checkpoint: Checkpoint, head: Header) {
  const indexed = BigInt(checkpoint.number);
  const headNumber = BigInt(head.number);
  const checkpointBlock = chain.block(indexed);
  const headBlock = indexed === headNumber ? checkpointBlock : chain.block(headNumber);
  const [sameCheckpoint, sameHead] = await Promise.all([checkpointBlock, headBlock]);
  if (sameCheckpoint?.hash !== checkpoint.hash)
    throw new ObservationError('checkpoint_hash_mismatch');
  if (sameHead?.hash !== head.hash) {
    throw new ObservationError('chain_changed_during_read');
  }
}

function buildObservation(
  config: Settings,
  head: Header,
  checkpoint: Checkpoint,
  indexed: bigint,
  eligible: bigint,
): Observation {
  const headNumber = BigInt(head.number);
  return {
    chainId: config.deployment.chainId,
    contractAddress: config.deployment.address,
    observedHead: {
      number: headNumber.toString(),
      hash: head.hash.toLowerCase(),
      timestamp: BigInt(head.timestamp).toString(),
    },
    indexedThrough: {
      number: checkpoint.number,
      hash: checkpoint.hash.toLowerCase(),
      timestamp: checkpoint.timestamp,
    },
    confirmationDelay: config.confirmationDelay,
    reorgWindowSeconds: config.reorgWindow,
    headLag: (headNumber - indexed).toString(),
    eligibleBacklog: (eligible - indexed).toString(),
  };
}

// Bootstrap validates deployment identity. Each request independently checks
// its SQL snapshot against fresh checkpoint/head hashes.
export async function queryObservation<T>(
  config: Settings,
  pool: pg.Pool,
  query: SnapshotQuery<T>,
  trace = newReadTrace(),
): Promise<{ data: T; observation: Observation }> {
  const chain = chainReader(config);
  const head = await readValidHead(chain, trace);
  const { data, checkpoint } = await readSnapshot(
    config,
    pool,
    query,
    BigInt(head.timestamp),
    trace,
  );
  const { indexed, eligible } = validateCheckpoint(config, checkpoint, BigInt(head.number), trace);
  await assertChainUnchanged(chain, checkpoint, head);

  return { data, observation: buildObservation(config, head, checkpoint, indexed, eligible) };
}
