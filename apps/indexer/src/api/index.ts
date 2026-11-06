import { Hono } from 'hono';
import { settings } from '../../config.ts';
import { connection, readObservation } from '../../read-model.ts';
import { ObservationError } from '../../rpc.ts';
const config = settings();
const pool = connection(config);
const app = new Hono();
// Internal S2 observation facade. Public API behavior is the separate S3 slice.
app.get('/observed/:resource', async (c) => {
  if (!['escrows', 'health'].includes(c.req.param('resource'))) return c.notFound();
  try {
    const ready = await fetch(`http://127.0.0.1:${config.port}/ready`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (ready.status !== 200) throw new ObservationError('indexer_not_ready');
    const result = await readObservation(config, pool);
    return c.json(
      c.req.param('resource') === 'health' ? { ready: true, observation: result.observation } : result,
    );
  } catch (error) {
    return c.json(
      { ready: false, error: error instanceof ObservationError ? error.code : 'observation_unavailable' },
      503,
    );
  }
});
export default app;
