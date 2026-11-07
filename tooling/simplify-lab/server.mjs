import { createServer } from 'node:http';
import { readFile, mkdir, realpath, writeFile } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { captureSite } from './capture.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lab = join(root, 'tooling/simplify-lab');
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function loadCorpus(path) {
  const manifestPath = await realpath(path);
  const boundary = await realpath(resolve(dirname(manifestPath), '..'));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.cases) || manifest.cases.length > 100)
    throw new Error('Invalid corpus');
  const ids = new Set();
  return Promise.all(
    manifest.cases.map(async (entry) => {
      if (
        !entry ||
        !/^[a-z0-9-]{1,100}$/.test(entry.id) ||
        ids.has(entry.id) ||
        typeof entry.path !== 'string' ||
        !/^[a-f0-9]{64}$/.test(entry.sourceHash)
      )
        throw new Error('Invalid corpus case');
      ids.add(entry.id);
      const source = await realpath(resolve(dirname(manifestPath), entry.path));
      const scoped = relative(boundary, source);
      if (scoped.startsWith('..') || scoped.startsWith('/'))
        throw new Error('Corpus path escapes boundary');
      const bytes = await readFile(source);
      if (
        bytes.length > 40_000_000 ||
        sha256(bytes) !== entry.sourceHash ||
        bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      )
        throw new Error('Corpus source hash or PNG mismatch');
      return {
        id: entry.id,
        title: entry.id,
        sourceHash: entry.sourceHash,
        bytes,
        roles: [],
        private: true,
      };
    })
  );
}
async function bundleCurrent() {
  const generated = join(root, '.tmp/simplify-lab-generated');
  await mkdir(generated, { recursive: true });
  const common = {
    absWorkingDir: root,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome120',
    metafile: true,
    write: false,
  };
  const worker = await build({
    ...common,
    entryPoints: ['apps/extension/src/offscreen/simplify/worker.ts'],
    outfile: join(generated, 'worker.mjs'),
  });
  const adapter = await build({
    ...common,
    stdin: {
      resolveDir: root,
      sourcefile: 'simplify-lab-adapter.ts',
      contents: `
import {createSimplifyComputeClient} from './apps/extension/src/workflows/simplify/compute-client';
import {createSimplifyService} from './apps/extension/src/offscreen/simplify/service';
const service = createSimplifyService({createWorker: () => new Worker('/generated/worker.mjs', {type: 'module'})});
export const compute = createSimplifyComputeClient({async send(request) {
try { const command = request.operation === 'prepare' ? {...request, sessionId: crypto.randomUUID()} : request;
return {success: true, ...await service.execute(command)};
} catch {return {success: false};}
}});
window.addEventListener('pagehide', () => {compute.dispose();service.dispose();});
`,
    },
    outfile: join(generated, 'adapter.mjs'),
  });
  const sources = {};
  for (const name of new Set([
    ...Object.keys(worker.metafile.inputs),
    ...Object.keys(adapter.metafile.inputs),
  ])) {
    if (name === 'simplify-lab-adapter.ts') continue;
    sources[name] = sha256(await readFile(resolve(root, name)));
  }
  const sourceDigest = sha256(JSON.stringify(sources));
  await Promise.all([
    writeFile(join(generated, 'worker.mjs'), worker.outputFiles[0].contents),
    writeFile(join(generated, 'adapter.mjs'), adapter.outputFiles[0].contents),
  ]);
  return {
    worker: worker.outputFiles[0].contents,
    adapter: adapter.outputFiles[0].contents,
    stamp: {
      sourceDigest,
      sources,
      workerDigest: sha256(worker.outputFiles[0].contents),
      adapterDigest: sha256(adapter.outputFiles[0].contents),
    },
  };
}
export async function startLab({ port = 0, corpus = null, targets, capture = captureSite } = {}) {
  const bundled = await bundleCurrent();
  const catalog = JSON.parse(await readFile(join(lab, 'sites.json'), 'utf8'));
  const selected = targets
    ? catalog.cases.filter((entry) => targets.includes(entry.id))
    : corpus
      ? []
      : catalog.cases;
  if (targets?.some((id) => !selected.some((entry) => entry.id === id)))
    throw new Error('Unknown site identity');
  const fixtures = {
    cases: selected.map((entry) => ({ ...entry, roles: [], captureUrl: `/capture/${entry.id}` })),
  };
  const privateCases = corpus ? await loadCorpus(corpus) : [];
  const routes = new Map();
  for (const file of ['index.html', 'app.mjs', 'style.css'])
    routes.set(file === 'index.html' ? '/' : `/${file}`, {
      bytes: await readFile(join(lab, file)),
      type: file.endsWith('mjs')
        ? 'text/javascript'
        : file.endsWith('css')
          ? 'text/css'
          : 'text/html',
    });
  for (const entry of privateCases) {
    routes.set(`/corpus/${entry.id}.png`, { bytes: entry.bytes, type: 'image/png' });
    fixtures.cases.push({ ...entry, bytes: undefined, url: `/corpus/${entry.id}.png` });
  }
  const config = {
    ...fixtures,
    stamp: {
      ...bundled.stamp,
      generatedAt: new Date().toISOString(),
      catalogDigest: sha256(JSON.stringify(fixtures)),
    },
  };
  routes.set('/config.json', { bytes: JSON.stringify(config), type: 'application/json' });
  routes.set('/generated/worker.mjs', { bytes: bundled.worker, type: 'text/javascript' });
  routes.set('/generated/adapter.mjs', { bytes: bundled.adapter, type: 'text/javascript' });
  const captures = new Map();
  let captureQueue = Promise.resolve();
  const server = createServer(async (request, response) => {
    const expectedHost = `127.0.0.1:${server.address().port}`;
    const route =
      request.headers.host === expectedHost && request.method === 'GET' && routes.get(request.url);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'; img-src 'self' data: blob:; worker-src 'self';",
        "style-src 'self'; script-src 'self'; connect-src 'self' data:",
      ].join(' ')
    );
    const site = fixtures.cases.find((entry) => entry.captureUrl === request.url);
    if (
      site &&
      request.method === 'POST' &&
      request.headers.host === expectedHost &&
      request.headers.origin === `http://${expectedHost}` &&
      request.headers['content-type'] === 'application/json'
    ) {
      if (!captures.has(site.id)) {
        const pending = captureQueue.then(() =>
          capture(site, { out: join(root, '.tmp/simplify-lab-captures') })
        );
        captureQueue = pending.catch(() => undefined);
        captures.set(site.id, pending);
      }
      try {
        const captured = await captures.get(site.id);
        if (captured.status !== 'PASS') captures.delete(site.id);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            ...captured,
            bytes: undefined,
            dataUrl: captured.bytes
              ? `data:image/png;base64,${captured.bytes.toString('base64')}`
              : undefined,
          })
        );
      } catch {
        captures.delete(site.id);
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'FAIL', reason: 'Site capture failed' }));
      }
      return;
    }
    if (!route) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': route.type });
    response.end(route.bytes);
  });
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveReady);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    config,
    close: () =>
      new Promise((done, reject) => server.close((error) => (error ? reject(error) : done()))),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  if (
    args.some(
      (arg, index) =>
        ['--port', '--corpus', '--target'].includes(arg) &&
        (!args[index + 1] || args[index + 1].startsWith('--'))
    )
  )
    throw new Error('Option requires a value');
  if (
    args.some(
      (arg, index) =>
        !['--port', '--corpus', '--target'].includes(arg) &&
        !['--port', '--corpus', '--target'].includes(args[index - 1])
    )
  )
    throw new Error('Unknown option');
  const port = value('--port') === undefined ? 4179 : Number(value('--port'));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const instance = await startLab({
    port,
    corpus: value('--corpus'),
    targets: value('--target') ? [value('--target')] : undefined,
  });
  console.log(`Simplify lab: ${instance.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void instance.close());
}
