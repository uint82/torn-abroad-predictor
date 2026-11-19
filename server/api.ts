import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import type { ApiOptions, ApiRequest, ApiResult } from './api-core';
import { CORS_HEADERS, GZIP_MIN_BYTES, handleApiRequest } from './api-core';

export type { ApiOptions } from './api-core';

export {
  DEFAULT_OBSERVATION_DAYS,
  GZIP_MIN_BYTES,
  MAX_OBSERVATION_DAYS,
  OBSERVATION_CACHE_SECONDS,
} from './api-core';

function setCommonHeaders(res: ServerResponse): void {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value);
  }
}

function sendResult(req: IncomingMessage, res: ServerResponse, result: ApiResult): void {
  setCommonHeaders(res);
  res.statusCode = result.status;
  if (result.status === 204 || result.body === null) {
    res.end();
    return;
  }

  const body = Buffer.from(JSON.stringify(result.body));
  const acceptsGzip = req.headers['accept-encoding']?.includes('gzip') ?? false;
  const compressed = acceptsGzip && body.byteLength >= GZIP_MIN_BYTES;
  const output = compressed ? gzipSync(body) : body;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', result.cacheControl);
  res.setHeader('Vary', 'Accept-Encoding');
  if (compressed) {
    res.setHeader('Content-Encoding', 'gzip');
  }
  res.setHeader('Content-Length', String(output.byteLength));
  res.end(output);
}

export function createApiHandler(
  options: ApiOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      sendResult(req, res, {
        status: 400,
        body: { error: 'Invalid request URL.' },
        cacheControl: 'no-store',
      });
      return;
    }

    const request: ApiRequest = { method: req.method ?? 'GET', url };
    sendResult(req, res, await handleApiRequest(request, options));
  };
}
