import { Hono } from 'hono';
import { graphql, sql } from 'ponder';
import { db } from 'ponder:api';
import schema, { checkpoint, escrow } from 'ponder:schema';
import { rpc, validateIdentity } from '../../rpc';

const app = new Hono();
// These prefixed routes demonstrate the public facade's data/health semantics.
// Ponder reserves /health and /ready; production routing must expose the facade.
app.get('/observed/:resource', async (c) => {
  if (process.env.POC_MODE !== 'checkpoint' || !['escrows', 'health'].includes(c.req.param('resource'))) return c.notFound();
  try {
    await validateIdentity();
    const ready = await fetch(`${process.env.POC_HTTP_ORIGIN}/ready`, { signal: AbortSignal.timeout(1_000) });
    if (ready.status !== 200) throw new Error('Engine not ready');
    // One SQL statement gives rows and checkpoint from the same DB snapshot.
    const rows = await db.select({ number: checkpoint.number, hash: checkpoint.hash, timestamp: checkpoint.timestamp,
      id: escrow.id, amount: escrow.amount, status: escrow.status }).from(checkpoint).leftJoin(escrow, sql`true`);
    const observed = rows[0];
    if (!observed) throw new Error('No projected checkpoint');
    const canonical = await rpc('eth_getBlockByNumber', [`0x${observed.number.toString(16)}`, false]);
    const head = BigInt(await rpc('eth_blockNumber'));
    const delay = BigInt(process.env.POC_CONFIRMATION_DELAY ?? '2');
    if (canonical?.hash !== observed.hash || head < observed.number + delay) throw new Error('Noncanonical or ineligible checkpoint');
    await validateIdentity();
    const recheck = await rpc('eth_getBlockByNumber', [`0x${observed.number.toString(16)}`, false]);
    if (recheck?.hash !== observed.hash) throw new Error('Checkpoint changed during read');
    const body = { checkpoint: { number: observed.number.toString(), hash: observed.hash, timestamp: observed.timestamp.toString() },
      items: rows.filter(row => row.id !== null).map(row => ({ id: row.id!.toString(), amount: row.amount!.toString(), status: row.status })) };
    return c.json(c.req.param('resource') === 'health' ? { ready: true, checkpoint: body.checkpoint } : body);
  } catch { return c.json({ error: 'Observation unavailable' }, 503); }
});
app.use('/graphql', async (c, next) => {
  if (process.env.POC_MODE === 'checkpoint') return c.json({ error: 'Use guarded facade' }, 503);
  if (process.env.POC_MODE === 'guarded') {
    try {
      await validateIdentity();
      const readiness = await fetch(`${process.env.POC_HTTP_ORIGIN}/ready`, { signal: AbortSignal.timeout(1_000) });
      if (readiness.status !== 200) throw new Error('Engine not ready');
    } catch {
      return c.json({ error: 'Observation unavailable' }, 503);
    }
  }
  await next();
});
app.use('/graphql', graphql({ db, schema }));
export default app;
