import pg from 'pg';
import type { Settings } from './config.ts';
import { chainReader, ObservationError } from './rpc.ts';
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
export async function readObservation(config: Settings, pool: pg.Pool) {
  const chain = chainReader(config);
  await chain.identity();
  const head = await chain.block('latest');
  if (!head) throw new ObservationError('rpc_unavailable');
  const client = await pool.connect();
  let checkpoint: { scope_key: string; number: string; hash: string; timestamp: string };
  let items: Record<string, unknown>[];
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const point = await client.query(
      `SELECT scope_key, number::text, hash, timestamp::text FROM "${config.schema}".checkpoint WHERE id=1`,
    );
    if (!point.rows[0]) throw new ObservationError('checkpoint_unavailable');
    checkpoint = point.rows[0];
    items = (await client.query(`SELECT * FROM "${config.schema}".escrows ORDER BY id`)).rows;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (checkpoint.scope_key !== config.scopeKey) throw new ObservationError('persisted_scope_mismatch');
  const indexed = BigInt(checkpoint.number);
  if (indexed < config.startupMinBlock) throw new ObservationError('startup_catchup');
  const headNumber = BigInt(head.number);
  const eligible = headNumber - BigInt(config.confirmationDelay);
  if (indexed > eligible) throw new ObservationError('checkpoint_not_eligible');
  const canonical = await chain.block(indexed);
  if (canonical?.hash !== checkpoint.hash) throw new ObservationError('checkpoint_hash_mismatch');
  await chain.identity();
  const [again, sameHead] = await Promise.all([chain.block(indexed), chain.block(headNumber)]);
  if (again?.hash !== checkpoint.hash || sameHead?.hash !== head.hash)
    throw new ObservationError('chain_changed_during_read');
  return {
    items,
    observation: {
      chainId: config.deployment.chainId,
      contractAddress: config.deployment.address,
      observedHead: {
        number: headNumber.toString(),
        hash: head.hash,
        timestamp: BigInt(head.timestamp).toString(),
      },
      indexedThrough: { number: checkpoint.number, hash: checkpoint.hash, timestamp: checkpoint.timestamp },
      confirmationDelay: config.confirmationDelay,
      reorgWindowSeconds: config.reorgWindow,
      headLag: (headNumber - indexed).toString(),
      eligibleBacklog: (eligible - indexed).toString(),
    },
  };
}
