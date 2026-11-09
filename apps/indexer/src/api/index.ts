import { Hono } from 'hono';

// Ponder requires this export to start its internal health/readiness server.
// Consumer routes live in api/server.ts; no custom engine routes are needed.
export default new Hono();
