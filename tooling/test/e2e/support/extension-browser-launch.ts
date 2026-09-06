import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

type LaunchedBrowser = {
  browser: Browser;
  context: BrowserContext;
  extensionId: string;
  userDataDir: string;
};

type LaunchExtensionBrowserOptions = {
  extensionBuildDir?: string;
  userDataDir?: string;
};

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

function resolveExtensionPath(extensionBuildDir?: string): string {
  return join(
    process.cwd(),
    extensionBuildDir ?? process.env.SNIPTALE_EXTENSION_BUILD_DIR ?? 'dist'
  );
}

function getChromiumLaunchArgs(): string[] {
  return [
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--disable-sync',
    '--disable-features=SigninIntercept,ChromeSigninPromo,ChromeRefresh2023,SearchEngineChoice',
    '--disable-crash-reporter',
    '--disable-crashpad',
    '--disable-breakpad',
    '--enable-unsafe-extension-debugging',
    '--auto-select-desktop-capture-source=Entire screen',
    '--auto-select-screen-capture-source',
  ];
}

export function deriveChromeExtensionId(manifestKey: string): string {
  const decodedKey = Buffer.from(manifestKey, 'base64');
  if (
    decodedKey.length === 0 ||
    decodedKey.toString('base64').replace(/=+$/u, '') !== manifestKey.replace(/=+$/u, '')
  ) {
    throw new Error('Extension manifest key is not valid base64');
  }
  const digest = createHash('sha256').update(decodedKey).digest('hex');
  return digest
    .slice(0, 32)
    .replace(/[0-9a-f]/gu, (nibble) =>
      String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(nibble, 16))
    );
}

async function resolvePinnedExtensionId(extensionPath: string): Promise<string | null> {
  const manifest: unknown = JSON.parse(
    await readFile(join(extensionPath, 'manifest.json'), 'utf8')
  );
  if (typeof manifest !== 'object' || manifest === null || !('key' in manifest)) return null;
  const key = (manifest as { key?: unknown }).key;
  if (typeof key !== 'string') throw new Error('Extension manifest key must be a string');
  return deriveChromeExtensionId(key);
}

async function removeOwnedUserDataDir(userDataDir: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(userDataDir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : null;
      if (code !== 'ENOTEMPTY' && code !== 'EBUSY') throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

export async function launchExtensionBrowser(
  options: LaunchExtensionBrowserOptions = {}
): Promise<LaunchedBrowser> {
  const ownsUserDataDir = options.userDataDir === undefined;
  const userDataDir = options.userDataDir ?? (await mkdtemp(join(tmpdir(), 'sniptale-pw-')));
  const extensionPath = resolveExtensionPath(options.extensionBuildDir);
  const expectedExtensionId = await resolvePinnedExtensionId(extensionPath);
  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      args: getChromiumLaunchArgs(),
      channel: 'chromium',
      headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
      ignoreDefaultArgs: ['--disable-extensions'],
    });
    const browser = context.browser();
    if (!browser) throw new Error('Persistent extension context has no browser owner');
    const session = await browser.newBrowserCDPSession();
    const loaded = (await session.send('Extensions.loadUnpacked', {
      path: extensionPath,
    })) as { id?: unknown };
    await session.detach();
    if (typeof loaded.id !== 'string') {
      throw new Error('Chromium did not return an ID for the unpacked extension');
    }
    if (expectedExtensionId && loaded.id !== expectedExtensionId) {
      throw new Error(
        `Loaded extension ID ${loaded.id} does not match pinned manifest identity ${expectedExtensionId}`
      );
    }

    await ensurePage(context);
    const initialPage = context.pages()[0];
    if (initialPage) {
      await dismissFirstRunPrompt(initialPage);
    }

    return {
      browser,
      context,
      extensionId: loaded.id,
      userDataDir,
    };
  } catch (error) {
    await context?.close().catch(() => undefined);
    if (ownsUserDataDir) {
      await removeOwnedUserDataDir(userDataDir);
    }
    throw error;
  }
}

export async function closeExtensionBrowser(
  launched: LaunchedBrowser,
  options: { removeUserDataDir?: boolean } = {}
): Promise<void> {
  await launched.browser.close().catch(() => undefined);
  if (options.removeUserDataDir) {
    await rm(launched.userDataDir, { recursive: true, force: true });
  }
}

export { dismissFirstRunPrompt };
