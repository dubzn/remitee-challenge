import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type pg from 'pg';
import type { Settings } from '../config.ts';
import { ObservationError } from '../rpc.ts';
import { InputError, parseRequest } from './domain.ts';
import { unavailabilityReason } from './errors.ts';
import { engineState, health } from './health.ts';
import { readEscrows } from './queries.ts';

function sendJson(response: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
  });
  response.end(data);
}

function sendError(response: ServerResponse, error: unknown) {
  if (error instanceof InputError) {
    sendJson(response, 400, {
      error: { code: 'invalid_request', message: error.message, parameter: error.parameter },
    });
    return;
  }
  sendJson(response, 503, {
    error: {
      code: 'observation_unavailable',
      message: 'A verified read is currently unavailable.',
      reason: unavailabilityReason(error),
    },
  });
}

export function apiServer(config: Settings, pool: pg.Pool, specPath: string) {
  const specification = readFileSync(specPath);

  return createServer(
    { requestTimeout: 10_000, headersTimeout: 10_000 },
    async function handleRequest(request, response) {
      if (request.method !== 'GET') {
        response.setHeader('allow', 'GET');
        sendJson(response, 405, {
          error: { code: 'method_not_allowed', message: 'Use GET.' },
        });
        return;
      }

      try {
        const query = parseRequest(request.url ?? '/');
        switch (query.kind) {
          case 'spec':
            response.writeHead(200, {
              'content-type': 'application/yaml; charset=utf-8',
              'content-length': specification.length,
            });
            response.end(specification);
            return;
          case 'not_found':
            sendJson(response, 404, {
              error: { code: 'route_not_found', message: 'Unknown route.' },
            });
            return;
          case 'health': {
            const result = await health(config, pool);
            sendJson(response, result.status, result.body);
            return;
          }
          default: {
            // Read verification has priority; engine unreadiness also turns an
            // otherwise verified 404 into 503 instead of claiming absence.
            const result = await readEscrows(config, pool, query);
            const engine = await engineState(config);
            if (engine.reason) throw new ObservationError(engine.reason);
            sendJson(response, result.status, result.body);
          }
        }
      } catch (error) {
        sendError(response, error);
      }
    },
  );
}
