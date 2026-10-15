import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/plain; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.woff2', 'font/woff2'],
]);

function isWithin(file, directory) {
  return file.startsWith(directory + sep);
}

async function resolveFile(root, pathname) {
  const tool = resolve(root, 'tooling/design-reference');
  const docs = resolve(root, 'docs/design');
  const entry = resolve(root, 'DESIGN.md');
  let candidate = resolve(root, '.' + pathname);
  if (
    candidate !== entry &&
    candidate !== tool &&
    !isWithin(candidate, tool) &&
    !isWithin(candidate, docs)
  ) {
    return null;
  }
  if ((await stat(candidate)).isDirectory()) candidate = resolve(candidate, 'index.html');
  if (!contentTypes.has(extname(candidate))) return null;
  const canonical = await realpath(candidate);
  if (canonical !== entry && !isWithin(canonical, tool) && !isWithin(canonical, docs)) {
    return null;
  }
  return (await stat(canonical)).isFile() ? canonical : null;
}

/** Serve only the local reference and its canonical documents. Callers own the listener lifetime. */
export function createDesignReferenceServer({ root = repositoryRoot } = {}) {
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (
        pathname.includes('\0') ||
        pathname.includes('\\') ||
        pathname.split('/').includes('..')
      ) {
        response.writeHead(400).end('Invalid path');
        return;
      }
      if (pathname === '/') {
        response.writeHead(302, { Location: '/tooling/design-reference/' }).end();
        return;
      }
      const canonicalRoot = await realpath(root);
      const file = await resolveFile(canonicalRoot, pathname);
      if (!file) {
        response.writeHead(404).end('Not found');
        return;
      }
      const contents = await readFile(file);
      response.writeHead(200, {
        'Content-Type': contentTypes.get(extname(file)),
        'Content-Length': contents.length,
      });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      const status = error instanceof URIError ? 400 : error.code === 'ENOENT' ? 404 : 500;
      response.writeHead(status).end(status === 400 ? 'Invalid path' : 'Not found');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const port =
    args.length === 0 ? 8780 : args[0] === '--port' && args.length === 2 ? Number(args[1]) : NaN;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Use --port with an integer from 0 to 65535.');
  }
  const server = createDesignReferenceServer();
  server.on('error', (error) => {
    process.stderr.write(`Design reference server: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(
      `Design reference: http://127.0.0.1:${server.address().port}/tooling/design-reference/\n`
    );
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
