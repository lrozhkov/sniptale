import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

function getContentType(pathname: string): string {
  if (pathname.endsWith('.html')) return 'text/html; charset=utf-8';
  if (pathname.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.json') || pathname.endsWith('.map')) {
    return 'application/json; charset=utf-8';
  }

  return 'text/plain; charset=utf-8';
}

async function serveRequest(
  request: IncomingMessage,
  response: ServerResponse,
  fixtureRoot: string,
  fixturePath: string
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
  try {
    if (requestUrl.pathname === '/') {
      const html = await readFile(fixturePath, 'utf8');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }
    if (requestUrl.pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (requestUrl.pathname.startsWith('/fixtures/')) {
      const fixtureFile = join(fixtureRoot, requestUrl.pathname.replace('/fixtures/', ''));
      const html = await readFile(fixtureFile, 'utf8');
      response.writeHead(200, { 'content-type': getContentType(requestUrl.pathname) });
      response.end(html);
      return;
    }
    const distPath = join(process.cwd(), 'dist', requestUrl.pathname.replace(/^\//, ''));
    const file = await readFile(distPath);
    response.writeHead(200, {
      'access-control-allow-origin': '*',
      'content-type': getContentType(requestUrl.pathname),
    });
    response.end(file);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

/**
 * Tiny static server for a real http origin.
 * Content scripts do not inject into about:blank or chrome-extension pages.
 */
export async function startHostServer(): Promise<{ server: Server; origin: string }> {
  const fixtureRoot = join(process.cwd(), 'tooling', 'test', 'e2e', 'fixtures');
  const fixturePath = join(fixtureRoot, 'host-page.html');

  return await new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      void serveRequest(request, response, fixtureRoot, fixturePath);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve local host server address'));
        return;
      }

      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}
