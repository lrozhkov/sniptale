export class SmokeTargetSkippedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SmokeTargetSkippedError';
  }
}

async function decodeImages(page) {
  await page.evaluate(async () => {
    const pending = Array.from(globalThis.document.images, (image) => {
      if (image.complete) return image.decode().catch(() => undefined);
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }).then(() => image.decode().catch(() => undefined));
    });
    await Promise.race([
      Promise.allSettled(pending),
      new Promise((resolve) => setTimeout(resolve, 15_000)),
    ]);
  });
}

async function scrollPass(page, scrollRootSelector) {
  const deadline = Date.now() + 45_000;
  let top = 0;
  while (Date.now() < deadline) {
    const state = await page.evaluate(
      ({ nextTop, selector }) => {
        const root = selector
          ? globalThis.document.querySelector(selector)
          : (globalThis.document.scrollingElement ?? globalThis.document.documentElement);
        if (!root) throw new Error(`Scroll root "${selector}" is unavailable`);
        if (selector) root.scrollTop = nextTop;
        else globalThis.scrollTo(0, nextTop);
        return {
          height: selector
            ? root.scrollHeight
            : Math.max(root.scrollHeight, globalThis.document.body?.scrollHeight ?? 0),
          top: root.scrollTop,
          viewport: selector ? root.clientHeight : globalThis.innerHeight,
        };
      },
      { nextTop: top, selector: scrollRootSelector }
    );
    if (state.top + state.viewport >= state.height - 2) break;
    top = Math.min(state.height, state.top + Math.max(1, Math.floor(state.viewport * 0.8)));
    await page.waitForTimeout(100);
  }
  await page.evaluate((selector) => {
    if (selector) globalThis.document.querySelector(selector).scrollTop = 0;
    else globalThis.scrollTo(0, 0);
  }, scrollRootSelector);
  await page.waitForTimeout(150);
}

async function waitForStableGeometry(page) {
  let previous = null;
  let stableSamples = 0;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const current = await page.evaluate(() => {
      const root = globalThis.document.scrollingElement ?? globalThis.document.documentElement;
      return {
        height: Math.max(root.scrollHeight, globalThis.document.body?.scrollHeight ?? 0),
        width: Math.max(root.scrollWidth, globalThis.document.body?.scrollWidth ?? 0),
      };
    });
    stableSamples =
      previous?.height === current.height && previous?.width === current.width
        ? stableSamples + 1
        : 0;
    if (stableSamples >= 2) return current;
    previous = current;
    await page.waitForTimeout(300);
  }
  return previous;
}

function looksLikeAccessWall(title, bodyText) {
  const sample = `${title} ${bodyText}`.toLowerCase();
  return /captcha|verify you are human|sign in to continue|log in to continue|access denied|checking your browser/u.test(
    sample
  );
}

export async function prepareExternalTarget(page, descriptor) {
  let response;
  try {
    response = await page.goto(descriptor.url, {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
  } catch (error) {
    throw new SmokeTargetSkippedError(`navigation failed: ${error.message}`);
  }
  if (response && response.status() >= 500) {
    throw new SmokeTargetSkippedError(`server returned HTTP ${response.status()}`);
  }
  try {
    await page.locator(descriptor.readySelector).first().waitFor({
      state: 'visible',
      timeout: 30_000,
    });
  } catch {
    const accessWall = await page
      .evaluate(() => ({
        body: globalThis.document.body?.innerText.slice(0, 4000) ?? '',
        title: globalThis.document.title,
      }))
      .catch(() => ({ body: '', title: '' }));
    const reason = looksLikeAccessWall(accessWall.title, accessWall.body)
      ? 'access wall or CAPTCHA'
      : `readiness selector "${descriptor.readySelector}" was not reached`;
    throw new SmokeTargetSkippedError(reason);
  }
  await decodeImages(page);
  await scrollPass(page, descriptor.scrollRootSelector);
  await scrollPass(page, descriptor.scrollRootSelector);
  await decodeImages(page);
  const geometry = await waitForStableGeometry(page);
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  return geometry;
}

export async function settleRenderedDocument(frame) {
  await frame.evaluate(async () => {
    await Promise.race([
      globalThis.document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 10_000)),
    ]);
    await Promise.race([
      Promise.allSettled(
        Array.from(globalThis.document.images, (image) => image.decode().catch(() => undefined))
      ),
      new Promise((resolve) => setTimeout(resolve, 15_000)),
    ]);
  });
  await scrollPass(frame);
  await scrollPass(frame);
  await decodeImages(frame);
  return waitForStableGeometry(frame);
}
