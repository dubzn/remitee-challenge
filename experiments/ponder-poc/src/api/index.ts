import { Hono } from 'hono';
import { graphql } from 'ponder';
import { db } from 'ponder:api';
import schema from 'ponder:schema';
import { validateIdentity } from '../../rpc';

const app = new Hono();
app.use('/graphql', async (c, next) => {
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
