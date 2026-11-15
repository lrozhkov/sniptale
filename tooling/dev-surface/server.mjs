import { createReadStream } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { SURFACE_PROFILES } from './profiles.mjs';

const launcherPath = '/tooling/test/harness/dev-surface.html';
const profileNames = new Set(Object.keys(SURFACE_PROFILES));
const pageProfiles = new Map(
  Object.entries(SURFACE_PROFILES).map(([name, profile]) => [profile.route, name])
);
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.zip', 'application/zip'],
]);

function isWithin(root, path) {
  const offset = relative(root, path);
  return (
    offset === '' || (!isAbsolute(offset) && offset !== '..' && !offset.startsWith(`..${sep}`))
  );
}

function admitOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new Error('Dev surface options must be an object.');
  if (typeof options.root !== 'string' || !isAbsolute(options.root))
    throw new Error('Dev surface root must be an absolute path.');
  if (!['source', 'built'].includes(options.mode))
    throw new Error('Dev surface mode must be source or built.');
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535)
    throw new Error('Dev surface port must be an integer from 0 through 65535.');
  if (!profileNames.has(options.profile)) throw new Error('Unknown dev surface profile.');
  if (typeof options.token !== 'string' || options.token.length < 16)
    throw new Error('Dev surface token must contain at least 16 characters.');
  for (const name of ['fixture', 'buildDir']) {
    if (
      options[name] !== undefined &&
      (typeof options[name] !== 'string' || !isAbsolute(options[name]))
    )
      throw new Error(`Dev surface ${name} must be an absolute path.`);
  }
  if (options.fixture && !/^(?:sha256:)?[a-f0-9]{64}$/u.test(options.fixtureDigest ?? ''))
    throw new Error('Dev surface fixture requires a SHA-256 digest.');
  for (const name of ['id', 'locale', 'theme']) {
    if (options[name] !== undefined && typeof options[name] !== 'string')
      throw new Error(`Dev surface ${name} must be a string.`);
  }
}

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  if (status === 403) response.removeHeader('Access-Control-Allow-Origin');
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(body);
}

function sendJson(response, status, value) {
  send(response, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

function requestPath(request) {
  const path = decodeURIComponent((request.url ?? '/').split(/[?#]/u, 1)[0]);
  if (!path.startsWith('/') || /[\\\0]/u.test(path) || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(path))
    return null;
  const optimizedDependency =
    path.startsWith('/.tmp/dev-surface/vite-cache/deps/') &&
    ['.js', '.map'].includes(extname(path));
  if (!optimizedDependency && path.split('/').some((part) => part.startsWith('.'))) return null;
  return path;
}

function isPage(path) {
  return (
    path === '/' ||
    path === launcherPath ||
    path === '/apps/extension/src/gallery/index.html' ||
    pageProfiles.has(path)
  );
}

function chooseProfile(request, url, origin, initialProfile) {
  let page = new URL('/', origin);
  const location = url.searchParams.get('page') ?? request.headers.referer;
  if (location) {
    page = new URL(location, origin);
    if (page.origin !== origin && page.origin !== origin.replace('127.0.0.1', 'localhost'))
      throw new Error('Invalid dev surface page origin.');
  }
  const selected =
    url.searchParams.get('profile') ??
    url.searchParams.get('surface') ??
    page.searchParams.get('profile') ??
    page.searchParams.get('surface');
  if (selected !== null) {
    if (!profileNames.has(selected)) throw new Error('Unknown dev surface profile.');
    return selected;
  }
  if (page.pathname === '/apps/extension/src/gallery/index.html')
    return page.searchParams.get('mode') === 'edit' ? 'gallery-editor' : 'library';
  return pageProfiles.get(page.pathname) ?? initialProfile;
}

async function serveFile(request, response, file, root) {
  let canonical;
  try {
    canonical = await realpath(file);
  } catch {
    send(response, 404, 'Not found');
    return;
  }
  if (!isWithin(root, canonical)) {
    send(response, 403, 'Forbidden');
    return;
  }
  const info = await stat(canonical);
  if (!info.isFile()) {
    send(response, 404, 'Not found');
    return;
  }
  const sandboxAsset = ['.js', '.mjs', '.wasm', '.woff', '.woff2', '.ttf'].includes(
    extname(canonical)
  );
  response.writeHead(200, {
    'content-type': contentTypes.get(extname(canonical)) ?? 'application/octet-stream',
    'content-length': info.size,
    ...(sandboxAsset ? { Vary: 'Origin' } : {}),
    ...(sandboxAsset && request.headers.origin === 'null'
      ? {
          'Access-Control-Allow-Origin': 'null',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        }
      : {}),
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  await pipeline(createReadStream(canonical), response);
}

/** Start one loopback UI stand and retain ownership of its HTTP, Vite, and sandbox resources. */
export async function startSurfaceServer(options) {
  admitOptions(options);
  const root = await realpath(options.root);
  let buildRoot;
  if (options.mode === 'built') {
    try {
      buildRoot = await realpath(options.buildDir ?? resolve(root, '.tmp/e2e-builds/test'));
      await access(resolve(buildRoot, launcherPath.slice(1)));
    } catch {
      throw new Error('Built dev surface is missing. Run npm run qa:e2e:build.');
    }
  }
  if (options.fixture && !(await stat(options.fixture)).isFile())
    throw new Error('Dev surface fixture is not a file.');
  let origin = '';
  let actualPort = options.port;
  let server;
  let vite;
  let closing;
  const close = () => {
    closing ??= vite
      ? vite.close()
      : new Promise((done, reject) => server.close((error) => (error ? reject(error) : done())));
    return closing;
  };
  const handle = async (request, response, next) => {
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    let path;
    try {
      path = requestPath(request);
    } catch {
      send(response, 400, 'Invalid request path');
      return;
    }
    if (path === null) {
      send(response, 403, 'Forbidden');
      return;
    }
    const host = request.headers.host;
    if (host !== `127.0.0.1:${actualPort}` && host !== `localhost:${actualPort}`) {
      send(response, 403, 'Forbidden host');
      return;
    }
    const url = new URL(request.url ?? '/', origin);
    const managementRequest = path.startsWith('/__dev_surface/');
    if (options.mode === 'source' || managementRequest) {
      const requestOrigin = request.headers.origin;
      if (
        (requestOrigin &&
          requestOrigin !== origin &&
          requestOrigin !== origin.replace('127.0.0.1', 'localhost')) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      ) {
        send(response, 403, 'Forbidden origin');
        return;
      }
    }
    if (managementRequest) {
      if (request.method === 'POST' && path === '/__dev_surface/stop') {
        if (request.headers.authorization !== `Bearer ${options.token}`) {
          send(response, 403, 'Invalid server token');
          return;
        }
        response.once('finish', () => {
          void close();
        });
        sendJson(response, 200, { stopped: true });
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        send(response, 405, 'Method not allowed');
        return;
      }
      if (path === '/__dev_surface/status') {
        sendJson(response, 200, {
          root,
          pid: process.pid,
          mode: options.mode,
          port: actualPort,
          token: options.token,
          fixtureDigest: options.fixtureDigest ?? null,
        });
        return;
      }
      if (path === '/__dev_surface/config') {
        let profile;
        try {
          profile = chooseProfile(request, url, origin, options.profile);
        } catch {
          send(response, 400, 'Invalid surface profile or page');
          return;
        }
        sendJson(response, 200, {
          profile,
          id: profile === options.profile ? (options.id ?? null) : null,
          locale: options.locale ?? 'en',
          theme: options.theme ?? 'light',
          fixtureUrl: options.fixture ? '/__dev_surface/fixture' : null,
          fixtureDigest: options.fixtureDigest ?? null,
        });
        return;
      }
      if (path === '/__dev_surface/fixture' && options.fixture) {
        await serveFile(
          request,
          response,
          options.fixture,
          await realpath(resolve(options.fixture, '..'))
        );
        return;
      }
      send(response, 404, 'Not found');
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      send(response, 405, 'Method not allowed');
      return;
    }
    if (options.mode === 'source') {
      if (isPage(path)) request.url = launcherPath + url.search;
      next();
      return;
    }
    if (isPage(path)) {
      const html = await readFile(resolve(buildRoot, launcherPath.slice(1)), 'utf8');
      send(
        response,
        200,
        html.replace('<head>', '<head><base href="/tooling/test/harness/">'),
        'text/html; charset=utf-8'
      );
      return;
    }
    if (['.ts', '.tsx', '.mts', '.cts'].includes(extname(path))) {
      send(response, 403, 'Built mode does not serve TypeScript sources');
      return;
    }
    await serveFile(request, response, resolve(buildRoot, path.slice(1)), buildRoot);
  };
  const middleware = (request, response, next) => {
    void handle(request, response, next).catch(() => {
      if (response.headersSent) response.destroy();
      else send(response, 500, 'Dev surface request failed');
    });
  };
  if (options.mode === 'source') {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      configFile: resolve(root, 'tooling/dev-surface/vite.config.ts'),
      root,
      server: { host: '127.0.0.1', port: options.port, strictPort: true },
      plugins: [
        {
          name: 'sniptale:dev-surface-routes',
          enforce: 'pre',
          configureServer(instance) {
            instance.middlewares.use(middleware);
          },
        },
      ],
    });
    try {
      await vite.listen();
    } catch (error) {
      await vite.close();
      throw error;
    }
    server = vite.httpServer;
  } else {
    server = createServer((request, response) =>
      middleware(request, response, () => send(response, 404, 'Not found'))
    );
    await new Promise((done, reject) => {
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', () => {
        server.off('error', reject);
        done();
      });
    });
  }
  const address = server.address();
  if (!address || typeof address === 'string') {
    await close();
    throw new Error('Dev surface has no TCP address.');
  }
  actualPort = address.port;
  origin = `http://127.0.0.1:${actualPort}`;
  return { origin, close };
}
