import type { ApiResult } from '../server/api-core';
import { CORS_HEADERS, GZIP_MIN_BYTES } from '../server/api-core';

function commonHeaders(): Headers {
  return new Headers(CORS_HEADERS);
}

async function compressedBody(text: string): Promise<ReadableStream<Uint8Array>> {
  return new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
}

export async function toWorkerResponse(
  result: ApiResult,
  acceptEncoding: string | null,
): Promise<Response> {
  const headers = commonHeaders();
  if (result.status === 204 || result.body === null) {
    return new Response(null, { status: result.status, headers });
  }

  const text = JSON.stringify(result.body);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', result.cacheControl);
  headers.set('Vary', 'Accept-Encoding');

  if (
    new TextEncoder().encode(text).byteLength >= GZIP_MIN_BYTES &&
    acceptEncoding?.includes('gzip')
  ) {
    headers.set('Content-Encoding', 'gzip');
    return new Response(await compressedBody(text), { status: result.status, headers });
  }
  return new Response(text, { status: result.status, headers });
}
