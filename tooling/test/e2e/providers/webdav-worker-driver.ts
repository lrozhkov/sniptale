import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

interface WorkerTarget {
  targetId: string;
  attached: boolean;
}
interface PendingCommand {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}
interface DriverOptions {
  extensionBuildDir: string;
  userDataDir?: string;
  /** Restore the command-line installation without another install or permission grant. */
  restoreExtensionId?: string;
  /** This browser is restricted to the loopback provider suite. */
  ignoreHTTPSErrors: true;
}

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));
function field(value: unknown, name: string): string {
  if (!isRecord(value) || typeof value[name] !== 'string') {
    throw new Error(`Invalid CDP field: ${name}`);
  }
  return value[name];
}

/** Raw browser/page CDP driver. It never attaches to, evaluates, or polls inside a worker. */
export async function launchWebdavWorkerDriver(options: DriverOptions) {
  if (
    options.restoreExtensionId !== undefined &&
    (!options.userDataDir || !/^[a-p]{32}$/u.test(options.restoreExtensionId))
  )
    throw new Error('Restored extension requires its existing profile and identity');
  const ownProfile = options.userDataDir === undefined;
  const profile = options.userDataDir ?? (await mkdtemp(join(tmpdir(), 'sniptale-webdav-worker-')));
  const browser = spawn(
    resolve('.playwright-browsers/chromium-1248/chrome-linux64/chrome'),
    [
      '--headless=new',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-crash-reporter',
      '--enable-unsafe-extension-debugging',
      ...(options.userDataDir ? [`--load-extension=${resolve(options.extensionBuildDir)}`] : []),
      '--disable-background-networking',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--enable-automation',
      '--password-store=basic',
      '--use-mock-keychain',
      '--ignore-certificate-errors',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let launchError: Error | null = null;
  browser.on('error', (error) => {
    launchError = error;
  });
  let socket: WebSocket | null = null;
  let sequence = 0;
  let closed = false;
  const pending = new Map<number, PendingCommand>();

  function rejectPending() {
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(new Error('WebDAV browser CDP connection closed'));
    }
    pending.clear();
  }
  function call(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<unknown> {
    const channel = socket;
    if (!channel || channel.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebDAV browser CDP connection is unavailable'));
    }
    const id = ++sequence;
    return new Promise((resolveCall, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(id, { resolve: resolveCall, reject, timeout });
      channel.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    if (socket?.readyState === WebSocket.OPEN) {
      await call('Browser.close').catch(() => undefined);
      socket.close();
    }
    rejectPending();
    if (browser.pid !== undefined && browser.exitCode === null && browser.signalCode === null) {
      await Promise.race([
        new Promise<void>((done) => browser.once('exit', () => done())),
        pause(2000),
      ]);
      if (browser.exitCode === null && browser.signalCode === null) {
        browser.kill('SIGTERM');
        await Promise.race([
          new Promise<void>((done) => browser.once('exit', () => done())),
          pause(2000),
        ]);
      }
      if (browser.exitCode === null && browser.signalCode === null) {
        browser.kill('SIGKILL');
        await new Promise<void>((done) => browser.once('exit', () => done()));
      }
    }
    if (ownProfile) await rm(profile, { recursive: true, force: true });
  }

  try {
    let endpoint: string | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (launchError) throw launchError;
      if (browser.exitCode !== null) throw new Error('WebDAV browser exited before CDP startup');
      try {
        const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8'))
          .trim()
          .split('\n');
        if (port && /^\d+$/u.test(port) && path?.startsWith('/devtools/browser/')) {
          endpoint = `ws://127.0.0.1:${port}${path}`;
          break;
        }
      } catch {
        /* Chromium has not published its endpoint yet. */
      }
      await pause(100);
    }
    if (!endpoint) throw new Error('WebDAV browser CDP endpoint is unavailable');
    const channel = new WebSocket(endpoint);
    socket = channel;
    await new Promise<void>((done, reject) => {
      channel.addEventListener('open', () => done(), { once: true });
      channel.addEventListener(
        'error',
        () => reject(new Error('WebDAV browser CDP connection failed')),
        { once: true }
      );
    });
    channel.addEventListener('close', rejectPending);
    channel.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        rejectPending();
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(event.data);
      } catch {
        rejectPending();
        return;
      }
      if (!isRecord(value) || typeof value['id'] !== 'number') return;
      const entry = pending.get(value['id']);
      if (!entry) return;
      pending.delete(value['id']);
      clearTimeout(entry.timeout);
      if (value['error'] !== undefined) entry.reject(new Error('Browser CDP command refused'));
      else entry.resolve(value['result']);
    });
    let extensionId = '';
    if (options.userDataDir) {
      let restored = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const installed = await call('Extensions.getExtensions');
        if (!isRecord(installed) || !Array.isArray(installed['extensions']))
          throw new Error('Restored extension inventory is invalid');
        const selected = installed['extensions'].find(
          (entry) =>
            isRecord(entry) &&
            typeof entry['path'] === 'string' &&
            resolve(entry['path']) === resolve(options.extensionBuildDir) &&
            (options.restoreExtensionId === undefined || entry['id'] === options.restoreExtensionId)
        );
        if (isRecord(selected) && typeof selected['id'] === 'string') {
          extensionId = selected['id'];
          restored = true;
          break;
        }
        await pause(100);
      }
      if (!restored) throw new Error('Existing extension installation did not survive restart');
    } else {
      const loaded = await call('Extensions.loadUnpacked', {
        path: resolve(options.extensionBuildDir),
      });
      extensionId = field(loaded, 'id');
    }
    if (!/^[a-p]{32}$/u.test(extensionId)) throw new Error('Invalid loaded extension identity');

    async function workerTargets(): Promise<WorkerTarget[]> {
      const result = await call('Target.getTargets');
      if (!isRecord(result) || !Array.isArray(result['targetInfos'])) {
        throw new Error('Invalid CDP target inventory');
      }
      const workers: WorkerTarget[] = [];
      for (const item of result['targetInfos']) {
        if (!isRecord(item)) throw new Error('Invalid CDP target description');
        if (
          item['type'] !== 'service_worker' ||
          typeof item['url'] !== 'string' ||
          !item['url'].startsWith(`chrome-extension://${extensionId}/`)
        )
          continue;
        if (typeof item['targetId'] !== 'string' || typeof item['attached'] !== 'boolean') {
          throw new Error('Invalid extension worker target');
        }
        workers.push({ targetId: item['targetId'], attached: item['attached'] });
      }
      return workers;
    }
    if ((await workerTargets()).some((worker) => worker.attached)) {
      throw new Error('A debugger is attached to the extension worker');
    }
    const page = await call('Target.createTarget', {
      url: `chrome-extension://${extensionId}/tooling/test/harness/security-control.html`,
    });
    const attached = await call('Target.attachToTarget', {
      targetId: field(page, 'targetId'),
      flatten: true,
    });
    const pageSession = field(attached, 'sessionId');
    async function evaluate(
      expression: string,
      evaluation: { userGesture?: boolean } = {}
    ): Promise<unknown> {
      const result = await call(
        'Runtime.evaluate',
        {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture: evaluation.userGesture ?? false,
        },
        pageSession
      );
      if (
        !isRecord(result) ||
        result['exceptionDetails'] !== undefined ||
        !isRecord(result['result'])
      ) {
        throw new Error('WebDAV lifecycle harness evaluation failed');
      }
      return result['result']['value'];
    }
    await call('Runtime.enable', {}, pageSession);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await evaluate('Boolean(window.webdavLifecycle)')) === true) {
          ready = true;
          break;
        }
      } catch {
        /* Initial page navigation can replace its execution context. */
      }
      await pause(100);
    }
    if (!ready) throw new Error('WebDAV lifecycle harness did not become ready');

    async function stopWorker(): Promise<{ oldTargetId: string; newTargetId?: string }> {
      const before = await workerTargets();
      const old = before[0];
      if (before.length !== 1 || !old || old.attached) {
        throw new Error('Extension worker is not uniquely unattached');
      }
      const result = await call('Target.closeTarget', { targetId: old.targetId });
      if (!isRecord(result) || result['success'] !== true)
        throw new Error('Worker termination was refused');
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const current = await workerTargets();
        if (current.some((worker) => worker.attached))
          throw new Error('A debugger attached to the extension worker');
        if (!current.some((worker) => worker.targetId === old.targetId)) {
          const replacement = current[0];
          return {
            oldTargetId: old.targetId,
            ...(replacement ? { newTargetId: replacement.targetId } : {}),
          };
        }
        await pause(100);
      }
      throw new Error('The exact old worker target did not terminate');
    }
    async function grantOrigin(origin: string): Promise<void> {
      const parsed = new URL(origin);
      if (
        parsed.protocol !== 'https:' ||
        parsed.origin !== origin ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
      )
        throw new Error('The lifecycle driver requires a loopback HTTPS origin');
      // Use Chrome's own extension settings to grant one optional origin before the experiment.
      const settings = await call('Target.createTarget', { url: 'chrome://extensions/' });
      const settingsId = field(settings, 'targetId');
      try {
        const session = field(
          await call('Target.attachToTarget', { targetId: settingsId, flatten: true }),
          'sessionId'
        );
        for (let index = 0; index < 100; index += 1) {
          const available = await call(
            'Runtime.evaluate',
            {
              expression: 'Boolean(chrome.developerPrivate?.addHostPermission)',
              returnByValue: true,
            },
            session
          );
          if (
            isRecord(available) &&
            isRecord(available['result']) &&
            available['result']['value'] === true
          )
            break;
          if (index === 99) throw new Error('Chrome extension settings are unavailable');
          await pause(100);
        }
        const result = await call(
          'Runtime.evaluate',
          {
            expression: `new Promise((resolve,reject)=>chrome.developerPrivate.addHostPermission(${JSON.stringify(extensionId)},${JSON.stringify(origin + '/*')},()=>chrome.runtime.lastError?reject(new Error('Origin grant refused')):resolve(true)))`,
            awaitPromise: true,
            returnByValue: true,
          },
          session
        );
        if (
          !isRecord(result) ||
          result['exceptionDetails'] !== undefined ||
          !isRecord(result['result']) ||
          result['result']['value'] !== true
        )
          throw new Error('Chrome extension settings refused the optional origin');
      } finally {
        await call('Target.closeTarget', { targetId: settingsId });
      }
      await evaluate(`chrome.permissions.request({origins:[${JSON.stringify(origin + '/*')}]})`, {
        userGesture: true,
      });
      if (
        (await evaluate(
          `chrome.permissions.contains({origins:[${JSON.stringify(origin + '/*')}]})`
        )) !== true
      )
        throw new Error('The native optional origin grant is unverified');
    }
    return { extensionId, evaluate, grantOrigin, workerTargets, stopWorker, close };
  } catch (error) {
    await close();
    throw error;
  }
}
