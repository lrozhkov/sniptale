import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getSurfaceProfile, SURFACE_PROFILES, surfaceUrl } from './profiles.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FLAGS = new Set([
  'fixture',
  'mode',
  'build-dir',
  'port',
  'id',
  'locale',
  'theme',
  'viewport',
  'time',
  'tool',
  'inspector',
]);
const SWITCHES = new Set(['foreground', 'screenshot', 'errors', 'trace']);
const VIEWPORTS = new Set(['1280x560', '1920x900', '1366x600', '1536x700', '2560x1280']);

/** Parse the closed CLI contract before reading a fixture or starting a process. */
export function parseSurfaceArguments(argv) {
  const [command = 'help', ...args] = argv;
  if (command === '--help' || command === 'help') return { command: 'help' };
  if (!['list', 'status', 'stop'].includes(command)) getSurfaceProfile(command);
  const result = { command, profile: command, mode: 'source', port: 4188 };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]?.replace(/^--/u, '');
    if (!args[index]?.startsWith('--') || (!FLAGS.has(flag) && !SWITCHES.has(flag)))
      throw new Error(`Unknown option: ${args[index]}`);
    if (seen.has(flag)) throw new Error(`Duplicate option: --${flag}`);
    seen.add(flag);
    const key = flag.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    if (SWITCHES.has(flag)) result[key] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`--${flag} requires a value.`);
      result[key] = value;
    }
  }
  if (command === 'list' && seen.size) throw new Error('list does not accept options.');
  if (['status', 'stop'].includes(command)) {
    if ([...seen].some((flag) => flag !== 'port'))
      throw new Error(`${command} accepts only --port.`);
  }
  if (!/^\d+$/u.test(String(result.port)) || Number(result.port) < 1 || Number(result.port) > 65535)
    throw new Error('--port requires an integer from 1 through 65535.');
  result.port = Number(result.port);
  if (!['source', 'built'].includes(result.mode))
    throw new Error('--mode must be source or built.');
  if (result.buildDir && result.mode !== 'built')
    throw new Error('--build-dir requires --mode built.');
  if (result.locale && !['en', 'ru'].includes(result.locale))
    throw new Error('--locale must be en or ru.');
  if (result.theme && !['light', 'dark'].includes(result.theme))
    throw new Error('--theme must be light or dark.');
  if (result.viewport && !VIEWPORTS.has(result.viewport))
    throw new Error(`--viewport must be one of ${[...VIEWPORTS].join(', ')}.`);
  if (result.time !== undefined) {
    const parts = result.time.split('.');
    if (
      parts.length > 2 ||
      parts.some((part) => !/^\d+$/u.test(part)) ||
      !Number.isFinite(Number(result.time))
    )
      throw new Error('--time requires nonnegative seconds.');
    result.time = Number(result.time);
  }
  if (!['list', 'status', 'stop'].includes(command)) {
    const profile = getSurfaceProfile(command);
    for (const key of ['time', 'tool', 'inspector'])
      if (result[key] !== undefined && !profile[`${key}Selector`])
        throw new Error(`--${key} is not supported by ${command}.`);
  }
  return result;
}

function statePath(root, port) {
  return path.join(root, '.tmp/dev-surface', `server-${port}.json`);
}

function readState(root, port) {
  try {
    const value = JSON.parse(fs.readFileSync(statePath(root, port), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function writeState(root, port, value) {
  const target = statePath(root, port);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

/** Authenticate the listening server independently of any stale PID file. */
export async function inspectSurfaceServer(root, port, request = fetch) {
  const stored = readState(root, port);
  let response;
  try {
    response = await request(`http://127.0.0.1:${port}/__dev_surface/status`, {
      signal: AbortSignal.timeout(1500),
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      error.cause &&
      typeof error.cause === 'object' &&
      error.cause.message === 'bad port'
    )
      throw new Error(`Port ${port} is blocked by this Node runtime. Choose another --port.`, {
        cause: error,
      });
    return { status: 'stopped', stored };
  }
  let live;
  try {
    live = await response.json();
  } catch {
    return { status: 'foreign', stored };
  }
  if (
    !response.ok ||
    !live ||
    typeof live !== 'object' ||
    Array.isArray(live) ||
    live.root !== root ||
    live.port !== port ||
    !Number.isInteger(live.pid) ||
    !stored ||
    stored.root !== root ||
    stored.port !== port ||
    stored.pid !== live.pid ||
    stored.token !== live.token ||
    stored.mode !== live.mode ||
    stored.fixtureDigest !== live.fixtureDigest ||
    typeof live.token !== 'string' ||
    live.token.length < 32
  )
    return { status: 'foreign', stored };
  return { status: 'running', stored, live };
}

/** Compatibility excludes page selection because each URL carries its own profile and identity. */
export function compatibleSurfaceServer(stored, options) {
  return (
    stored.mode === options.mode &&
    stored.fixtureDigest === options.fixtureDigest &&
    stored.buildDir === options.buildDir
  );
}

async function stopServer(root, port, request) {
  const state = await inspectSurfaceServer(root, port, request);
  if (state.status === 'foreign')
    throw new Error('Refusing to stop an unverified process on this port.');
  if (state.status === 'stopped') {
    fs.rmSync(statePath(root, port), { force: true });
    return 'Server is stopped. No process was signalled.';
  }
  const response = await request(`http://127.0.0.1:${port}/__dev_surface/stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.live.token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('The authenticated server refused shutdown.');
  for (let attempt = 0; attempt < 50; attempt++) {
    const next = await inspectSurfaceServer(root, port, request);
    if (next.status === 'stopped') {
      fs.rmSync(statePath(root, port), { force: true });
      return 'Server stopped.';
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Server shutdown did not finish. The state file remains for diagnosis.');
}

async function serve(options) {
  const { startSurfaceServer } = await import('./server.mjs');
  const server = await startSurfaceServer(options);
  writeState(options.root, options.port, { ...options, pid: process.pid, origin: server.origin });
  const close = async () => {
    await server.close();
    const state = readState(options.root, options.port);
    if (state?.pid === process.pid)
      fs.rmSync(statePath(options.root, options.port), { force: true });
  };
  process.once('SIGTERM', () => {
    void close().then(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    void close().then(() => process.exit(0));
  });
  return { server, close };
}

function admittedServerOptions(root, args) {
  const fixture = args.fixture ? fs.realpathSync(path.resolve(root, args.fixture)) : undefined;
  if (fixture && !fs.statSync(fixture).isFile())
    throw new Error('--fixture must name an archive file.');
  const fixtureDigest = fixture
    ? crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex')
    : null;
  const buildPath = path.resolve(root, args.buildDir ?? '.tmp/e2e-builds/test');
  if (args.mode === 'built' && !fs.existsSync(buildPath))
    throw new Error('Built launcher is missing. Run npm run qa:e2e:build first.');
  const buildDir = args.mode === 'built' ? fs.realpathSync(buildPath) : undefined;
  if (buildDir && !fs.existsSync(path.join(buildDir, 'tooling/test/harness/dev-surface.html')))
    throw new Error('Built launcher is missing. Run npm run qa:e2e:build first.');
  return {
    root,
    port: args.port,
    mode: args.mode,
    buildDir,
    fixture,
    fixtureDigest,
    profile: args.profile,
    id: args.id,
    locale: args.locale ?? 'en',
    theme: args.theme ?? 'dark',
    token: crypto.randomBytes(32).toString('hex'),
  };
}

/** Start, inspect, or stop this worktree's development server. */
export async function runSurfaceCli(
  argv,
  { root = ROOT, request = fetch, output = console.log } = {}
) {
  root = fs.realpathSync(root);
  const args = parseSurfaceArguments(argv);
  if (args.command === 'help') {
    output(
      'npm run dev:surface -- <profile|list|status|stop> [--fixture file] [--mode source|built]'
    );
    output(
      'Optional diagnostics: --viewport 1280x560 --screenshot --errors --trace --time seconds'
    );
    return;
  }
  if (args.command === 'list') {
    for (const name of Object.keys(SURFACE_PROFILES)) output(name);
    return;
  }
  if (args.command === 'stop') {
    output(await stopServer(root, args.port, request));
    return;
  }
  if (args.command === 'status') {
    const state = await inspectSurfaceServer(root, args.port, request);
    output(
      JSON.stringify({
        status: state.status,
        root,
        pid: state.live?.pid ?? null,
        mode: state.live?.mode ?? null,
        port: args.port,
      })
    );
    return;
  }
  const options = admittedServerOptions(root, args);
  let state = await inspectSurfaceServer(root, args.port, request);
  if (state.status === 'foreign')
    throw new Error('Port belongs to an unverified server. Choose another --port.');
  let foreground;
  if (state.status === 'stopped') {
    fs.mkdirSync(path.join(root, '.tmp/dev-surface'), { recursive: true });
    if (args.foreground) foreground = await serve(options);
    else {
      const config = path.join(root, '.tmp/dev-surface', `start-${crypto.randomUUID()}.json`);
      fs.writeFileSync(config, JSON.stringify(options), { mode: 0o600 });
      const log = fs.openSync(path.join(root, '.tmp/dev-surface', `server-${args.port}.log`), 'a');
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '__serve', config], {
        cwd: root,
        detached: true,
        stdio: ['ignore', log, log],
      });
      fs.closeSync(log);
      child.unref();
      let failure;
      child.once('error', (error) => {
        failure = error;
      });
      for (let attempt = 0; attempt < 1200; attempt++) {
        if (failure) throw failure;
        if (child.exitCode !== null)
          throw new Error('Server startup failed. Inspect .tmp/dev-surface/server logs.');
        state = await inspectSurfaceServer(root, args.port, request);
        if (state.status === 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (state.status !== 'running')
        throw new Error('Server startup did not finish. Inspect its local log.');
    }
  }
  if (state.status === 'running' && !compatibleSurfaceServer(state.stored, options))
    throw new Error('Server configuration differs. Stop this server or choose another --port.');
  const url = surfaceUrl(`http://127.0.0.1:${args.port}`, { ...options, ...args });
  output(`URL: ${url}`);
  output(`Worktree: ${root}`);
  output(
    'Viewport applies to managed diagnostics only. A manual browser tab controls its own CSS viewport.'
  );
  if (
    args.viewport ||
    args.screenshot ||
    args.errors ||
    args.trace ||
    args.time !== undefined ||
    args.tool ||
    args.inspector
  ) {
    const { captureSurfaceDiagnostics } = await import('./diagnostics.mjs');
    const report = await captureSurfaceDiagnostics({ root, url, ...args });
    output(JSON.stringify(report));
  }
  if (foreground) output('Foreground server remains active. Press Ctrl+C to stop.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '__serve') {
      const config = fs.realpathSync(process.argv[3] ?? '');
      const allowed = path.join(ROOT, '.tmp/dev-surface') + path.sep;
      if (!config.startsWith(allowed))
        throw new Error('Server configuration must stay in .tmp/dev-surface.');
      const options = JSON.parse(fs.readFileSync(config, 'utf8'));
      if (
        !options ||
        typeof options !== 'object' ||
        Array.isArray(options) ||
        options.root !== ROOT ||
        !Number.isInteger(options.port) ||
        options.port < 1 ||
        options.port > 65535 ||
        !['source', 'built'].includes(options.mode) ||
        typeof options.profile !== 'string' ||
        typeof options.token !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(options.token) ||
        !['en', 'ru'].includes(options.locale) ||
        !['light', 'dark'].includes(options.theme) ||
        (options.id !== undefined && typeof options.id !== 'string') ||
        ['fixture', 'buildDir'].some(
          (key) =>
            options[key] !== undefined &&
            (typeof options[key] !== 'string' || !path.isAbsolute(options[key]))
        ) ||
        (options.fixtureDigest !== null &&
          (typeof options.fixtureDigest !== 'string' ||
            !/^[a-f0-9]{64}$/u.test(options.fixtureDigest)))
      )
        throw new Error('Server configuration does not match the admitted launcher contract.');
      getSurfaceProfile(options.profile);
      fs.rmSync(config);
      await serve(options);
    } else await runSurfaceCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Development surface failed.');
    process.exitCode = 1;
  }
}
