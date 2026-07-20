import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

type LaunchedBrowser = {
  browser: Browser;
  browserProcess: ChildProcessWithoutNullStreams;
  context: BrowserContext;
  userDataDir: string;
};

async function reserveDebugPort(): Promise<number> {
  const { createServer } = await import('node:net');

  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to reserve a debugging port'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForWebSocketUrl(port: number): Promise<string> {
  const deadline = Date.now() + 20_000;
  const endpoint = `http://127.0.0.1:${port}/json/version`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        const payload = (await response.json()) as { webSocketDebuggerUrl?: string };
        if (payload.webSocketDebuggerUrl) {
          return payload.webSocketDebuggerUrl;
        }
      }
    } catch {
      // Browser is still booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for Chromium CDP endpoint on port ${port}`);
}

async function ensurePage(context: BrowserContext): Promise<Page> {
  const pages = context.pages();
  return pages.length > 0 ? pages[0] : context.newPage();
}

async function dismissFirstRunPrompt(page: Page): Promise<void> {
  const dismissButton = page.getByRole('button', { name: "Don't sign in" });
  if (await dismissButton.isVisible().catch(() => false)) {
    await dismissButton.click();
  }
}

function getChromiumLaunchConfig(debugPort: number) {
  const extensionPath = join(process.cwd(), 'dist');
  const executablePath = chromium.executablePath();

  return {
    executablePath,
    args: [
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-search-engine-choice-screen',
      '--disable-sync',
      '--disable-features=SigninIntercept,ChromeSigninPromo,ChromeRefresh2023,SearchEngineChoice',
      '--disable-crash-reporter',
      '--disable-crashpad',
      '--disable-breakpad',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--remote-debugging-port=${debugPort}`,
      'about:blank',
    ],
  };
}

async function ensureChromiumExecutable(executablePath: string): Promise<void> {
  await chmod(executablePath, 0o755);
}

function appendErrorChunk(stderr: string, chunk: Buffer): string {
  return stderr + chunk.toString();
}

export async function launchExtensionBrowser(): Promise<LaunchedBrowser> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'sniptale-pw-'));
  const debugPort = await reserveDebugPort();
  const launchConfig = getChromiumLaunchConfig(debugPort);

  await ensureChromiumExecutable(launchConfig.executablePath);

  const browserProcess = spawn(
    launchConfig.executablePath,
    [...launchConfig.args, `--user-data-dir=${userDataDir}`],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stderr = '';
  browserProcess.stderr.on('data', (chunk) => {
    stderr = appendErrorChunk(stderr, chunk);
  });

  try {
    const wsEndpoint = await waitForWebSocketUrl(debugPort);
    const browser = await chromium.connectOverCDP(wsEndpoint);
    const context = browser.contexts()[0] ?? browser.contexts().at(0);

    if (!context) {
      throw new Error('Connected to Chromium, but no browser context was available');
    }

    await ensurePage(context);
    const initialPage = context.pages()[0];
    if (initialPage) {
      await dismissFirstRunPrompt(initialPage);
    }

    return {
      browser,
      browserProcess,
      context,
      userDataDir,
    };
  } catch (error) {
    browserProcess.kill('SIGKILL');
    await rm(userDataDir, { recursive: true, force: true });
    const details = stderr.trim();
    const suffix = details ? `\nChromium stderr:\n${details}` : '';
    throw new Error(`${error instanceof Error ? error.message : String(error)}${suffix}`);
  }
}

export { dismissFirstRunPrompt };
