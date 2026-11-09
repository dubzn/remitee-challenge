import pg from 'pg';
import type { Settings } from './config.ts';
import { chainReader, ObservationError } from './rpc.ts';
import type { Header } from './rpc.ts';
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
  const present = (await pool.query('SELECT to_regclass($1) AS table', [`${config.schema}.checkpoint`]))
    .rows[0].table;
  if (fresh && present) throw new ObservationError('replay_requires_new_schema');
  if (!present) return 0n;
  const rows = (
    await pool.query(`SELECT scope_key, number::text FROM "${config.schema}".checkpoint WHERE id=1`)
  ).rows;
  if (rows[0] && rows[0].scope_key !== config.scopeKey)
    throw new ObservationError('persisted_scope_mismatch');
  if (!rows[0]) {
    const count = await pool.query(
      `SELECT (SELECT count(*) FROM "${config.schema}".journal)+(SELECT count(*) FROM "${config.schema}".escrows) AS n`,
    );
    if (BigInt(count.rows[0].n) !== 0n) throw new ObservationError('missing_scope_checkpoint');
  }
  return rows[0] ? BigInt(rows[0].number) : 0n;
}
export type Checkpoint = { scope_key: string; number: string; hash: string; timestamp: string };
export type ReadTrace = {
  head: Header | null;
  checkpoint: Checkpoint | null;
  rpc: 'up' | 'down' | 'unknown';
  database: 'up' | 'down' | 'unknown';
  scopeMatched: boolean;
  identityValidated: boolean;
};
export const newReadTrace = (): ReadTrace => ({
  head: null, checkpoint: null, rpc: 'unknown', database: 'unknown', scopeMatched: false, identityValidated: false,
});
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
export async function readCheckpoint(client: pg.Pool | pg.PoolClient, config: Settings) {
  const result = await client.query(
    `SELECT scope_key, number::text, hash, timestamp::text FROM "${config.schema}".checkpoint WHERE id=1`,
  );
  return (result.rows[0] as Checkpoint | undefined) ?? null;
}
export async function queryObservation<T>(
  config: Settings,
  pool: pg.Pool,
  query: (client: pg.PoolClient, headTime: bigint) => Promise<T>,
  trace = newReadTrace(),
): Promise<{ data: T; observation: Observation }> {
  const chain = chainReader(config);
  try {
    await chain.identity();
    trace.identityValidated = true;
    trace.rpc = 'up';
  } catch (error) {
    trace.rpc = error instanceof ObservationError && error.code === 'deployment_identity_mismatch' ? 'up' : 'down';
    throw error;
  }
  const head = await chain.block('latest');
  if (!head || typeof head.number !== 'string' || head.number.length > 66 || !/^0x[0-9a-fA-F]+$/.test(head.number)
    || typeof head.timestamp !== 'string' || head.timestamp.length > 18 || !/^0x[0-9a-fA-F]+$/.test(head.timestamp)
    || typeof head.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(head.hash)) {
    trace.rpc = 'down';
    throw new ObservationError('rpc_unavailable');
  }
  const headNumber = BigInt(head.number);
  const headTime = BigInt(head.timestamp);
  trace.head = head;
  let client: pg.PoolClient;
  try { client = await pool.connect(); trace.database = 'up'; }
  catch { trace.database = 'down'; throw new ObservationError('database_unavailable'); }
  let checkpoint: Checkpoint;
  let data: T;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const point = await readCheckpoint(client, config);
    if (!point) throw new ObservationError('checkpoint_unavailable');
    checkpoint = point;
    trace.checkpoint = point;
    data = await query(client, headTime);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof ObservationError) throw error;
    if ((error as { code?: string }).code === '42P01') throw new ObservationError('checkpoint_unavailable');
    trace.database = 'down';
    throw new ObservationError('database_unavailable');
  } finally {
    client.release();
  }
  if (checkpoint.scope_key !== config.scopeKey) throw new ObservationError('persisted_scope_mismatch');
  trace.scopeMatched = true;
  const indexed = BigInt(checkpoint.number);
  if (indexed < config.startupMinBlock) throw new ObservationError('startup_catchup');
  const eligible = headNumber - BigInt(config.confirmationDelay);
  if (indexed > eligible) throw new ObservationError('checkpoint_not_eligible');
  const canonical = await chain.block(indexed);
  if (canonical?.hash !== checkpoint.hash) throw new ObservationError('checkpoint_hash_mismatch');
  await chain.identity();
  const [again, sameHead] = await Promise.all([chain.block(indexed), chain.block(headNumber)]);
  if (again?.hash !== checkpoint.hash || sameHead?.hash !== head.hash)
    throw new ObservationError('chain_changed_during_read');
  return {
    data,
    observation: {
      chainId: config.deployment.chainId,
      contractAddress: config.deployment.address,
      observedHead: { number: headNumber.toString(), hash: head.hash.toLowerCase(), timestamp: headTime.toString() },
      indexedThrough: { number: checkpoint.number, hash: checkpoint.hash.toLowerCase(), timestamp: checkpoint.timestamp },
      confirmationDelay: config.confirmationDelay,
      reorgWindowSeconds: config.reorgWindow,
      headLag: (headNumber - indexed).toString(),
      eligibleBacklog: (eligible - indexed).toString(),
    },
  };
}
