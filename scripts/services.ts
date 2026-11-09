import pg from 'pg';

export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const url = process.env.RPC_URL;
  if (!url) throw new Error('RPC_URL is required');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = (await response.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  if (body.result === undefined) throw new Error(`${method}: missing result`);
  return body.result;
}

export function database(): pg.Client {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 2_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
  });
}
