const { loadSettingsMock } = vi.hoisted(() => ({ loadSettingsMock: vi.fn() }));
vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickActionAppearance } from '../../../contracts/quick-action-appearance';
import { reserveMediaErasureExclusion } from '../../mutation-exclusion/media-activity';
const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  current: vi.fn(),
  render: vi.fn(),
  save: vi.fn(),
  tab: vi.fn(),
  send: vi.fn(),
  ensure: vi.fn(),
  ready: vi.fn(),
}));
vi.mock('./flow/surface', () => ({
  getQuickActionAppearanceSnapshot: mocks.snapshot,
  assertQuickActionAppearanceTransaction: mocks.current,
}));
vi.mock('./appearance-render', () => ({ renderQuickActionAppearance: mocks.render }));
vi.mock('../../media-hub/assets', () => ({ saveScreenshotToMediaHubFromDataUrl: mocks.save }));
vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: { get: mocks.tab } }));
vi.mock('../../../platform/runtime-messaging', () => ({
  createRuntimeMessagingTransport: () => ({ sendRuntimeMessage: mocks.send }),
}));
vi.mock('../../offscreen-document/service', () => ({
  ensureOffscreenDocument: mocks.ensure,
  waitForOffscreenReady: mocks.ready,
}));
vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: (value: object) => ({
    ...value,
    capabilityToken: 'test-capability',
  }),
}));
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import type { QuickActionRasterOptions } from './appearance-render';
import { beginPageAppearance, prepareDesktopAppearance } from './appearance';
import { getMediaAuthorityGeneration } from '../../mutation-exclusion/media-activity';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
function output(text = 'Caption') {
  const appearance = createQuickActionAppearance();
  appearance.information.text = text;
  return { appearance, imageFormat: 'png' as const, imageQuality: 90 };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.snapshot.mockImplementation(() => structuredClone(output()));
  mocks.current.mockImplementation(() => undefined);
  mocks.render.mockResolvedValue('styled');
  mocks.save.mockResolvedValue('raw-asset');
  mocks.tab.mockResolvedValue({ title: 'Page title', url: 'https://example.test/page' });
});

describe('quick-action appearance admission and delivery preparation', () => {
  it('keeps parallel tab preparations isolated when raster replies resolve out of order', async () => {
    const first = deferred<string>(),
      second = deferred<string>();
    mocks.snapshot.mockImplementation((tabId: number) => output(String(tabId)));
    mocks.render.mockImplementation((options) =>
      options.appearance.information.text === '1' ? first.promise : second.promise
    );
    const a = beginPageAppearance(1, 'a'),
      b = beginPageAppearance(2, 'b');
    try {
      const pa = a.prepare!('raw-a', 'a.jpg'),
        pb = b.prepare!('raw-b', 'b.webp');
      await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2));
      second.resolve('styled-b');
      await expect(pb).resolves.toEqual({ dataUrl: 'styled-b', filename: 'b.png' });
      first.resolve('styled-a');
      await expect(pa).resolves.toEqual({ dataUrl: 'styled-a', filename: 'a.png' });
      expect(mocks.save).not.toHaveBeenCalled();
    } finally {
      a.release();
      b.release();
    }
  });
  it('preserves an admitted config after preset deletion but refuses a replaced transaction', async () => {
    const accepted = output('Accepted');
    mocks.snapshot.mockReturnValueOnce(structuredClone(accepted));
    const admission = beginPageAppearance(1, 'old');
    accepted.appearance.information.text = 'Deleted or reset';
    try {
      await admission.prepare!('raw', 'capture.png');
      expect(mocks.render.mock.calls[0]![0].appearance.information.text).toBe('Accepted');
      mocks.current.mockImplementation(() => {
        throw new Error('stale-transaction');
      });
      await expect(admission.prepare!('raw', 'capture.png')).rejects.toThrow('stale-transaction');
      expect(mocks.render).toHaveBeenCalledTimes(1);
    } finally {
      admission.release();
    }
  });
  it('drains admitted appearance before erasure and suppresses late fallback', async () => {
    const pending = deferred<string>();
    mocks.render.mockReturnValue(pending.promise);
    const admission = beginPageAppearance(1, 'tx');
    const preparation = admission.prepare!('raw', 'capture.png');
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledOnce());
    const exclusion = reserveMediaErasureExclusion();
    let drained = false;
    const drain = exclusion.waitForActiveMutations().then(() => {
      drained = true;
    });
    try {
      expect(drained).toBe(false);
      expect(() => beginPageAppearance(2, 'other')).toThrow('erasure');
      pending.resolve('late-result');
      await expect(preparation).rejects.toThrow('cancelled');
      expect(mocks.save).not.toHaveBeenCalled();
      admission.release();
      await drain;
      expect(drained).toBe(true);
    } finally {
      admission.release();
      exclusion.release();
    }
  });
  it('refuses a recreated action through its previous surface transaction', async () => {
    const pending = deferred<string>();
    mocks.render.mockReturnValue(pending.promise);
    let current = 'old';
    mocks.current.mockImplementation((_tab: number, id: string) => {
      if (id !== current) throw new Error('stale-transaction');
    });
    const admission = beginPageAppearance(1, 'old');
    try {
      const preparation = admission.prepare!('raw', 'capture.png');
      await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledOnce());
      current = 'new';
      pending.resolve('late');
      await expect(preparation).rejects.toThrow('stale-transaction');
      expect(mocks.save).not.toHaveBeenCalled();
    } finally {
      admission.release();
    }
  });
  it('retains the original after rendering failure and permits an explicit retry', async () => {
    mocks.render.mockRejectedValueOnce(new Error('renderer failed'));
    const admission = beginPageAppearance(7, 'tx');
    try {
      await expect(
        admission.prepare!('data:image/jpeg;base64,raw', 'capture.webp')
      ).rejects.toThrow();
      expect(mocks.save).toHaveBeenCalledWith(
        'data:image/jpeg;base64,raw',
        'capture.original.jpg',
        7,
        'temporary'
      );
      await expect(admission.prepare!('raw-retry', 'capture.webp')).resolves.toEqual({
        dataUrl: 'styled',
        filename: 'capture.png',
      });
      expect(mocks.render).toHaveBeenCalledTimes(2);
      admission.release();
      await expect(admission.prepare!('late', 'capture.png')).rejects.toThrow('cancelled');
    } finally {
      admission.release();
    }
  });
  it('does not claim durable source recovery after storage refusal', async () => {
    mocks.render.mockRejectedValue(new Error('renderer failed'));
    mocks.save.mockRejectedValue(new Error('storage full'));
    const admission = beginPageAppearance(1, 'tx');
    try {
      await expect(admission.prepare!('raw', 'capture.png')).rejects.toBeInstanceOf(AggregateError);
    } finally {
      admission.release();
    }
  });
  it('opens and reads legacy actions without acquiring metadata or a render lease', () => {
    const noAction = beginPageAppearance(1);
    expect(noAction.prepare).toBeUndefined();
    expect(mocks.snapshot).not.toHaveBeenCalled();
    mocks.snapshot.mockReturnValue({ imageFormat: 'png', imageQuality: 90 });
    const legacy = beginPageAppearance(1, 'legacy');
    expect(legacy.prepare).toBeUndefined();
    expect(mocks.tab).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it('omits nonweb page values and never queries a page for desktop appearance', async () => {
    mocks.tab.mockResolvedValue({
      title: 'Settings',
      url: 'chrome-extension://test/settings.html',
    });
    const admission = beginPageAppearance(1, 'tx');
    try {
      await admission.prepare!('raw', 'capture.png');
      expect(mocks.render.mock.calls[0]![0].metadata).not.toHaveProperty('url');
      expect(mocks.render.mock.calls[0]![0].metadata).not.toHaveProperty('title');
      mocks.tab.mockClear();
      await prepareDesktopAppearance(output(), getMediaAuthorityGeneration())('raw', 'capture.png');
      expect(mocks.tab).not.toHaveBeenCalled();
    } finally {
      admission.release();
    }
  });
});

it('prepares the offscreen header before publishing its raster and retains source on native refusal', async () => {
  mocks.ensure.mockResolvedValue(undefined);
  mocks.ready.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue({ success: true, dataUrl: 'header-raster' });
  mocks.render.mockImplementation(async (options: QuickActionRasterOptions) =>
    options.renderHeader({ header: DEFAULT_WINDOW_HEADER, source: { width: 640, height: 480 } })
  );
  const admission = beginPageAppearance(1, 'tx');
  try {
    await expect(admission.prepare!('raw', 'capture.png')).resolves.toMatchObject({
      dataUrl: 'header-raster',
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_QUICK_ACTION_HEADER',
        capabilityToken: 'test-capability',
      })
    );
    expect(mocks.ensure.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.ready.mock.invocationCallOrder[0]!
    );
    expect(mocks.ready.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.send.mock.invocationCallOrder[0]!
    );
    mocks.send.mockResolvedValueOnce({ success: false, error: 'offscreen refused' });
    await expect(admission.prepare!('data:image/webp;base64,raw', 'capture.png')).rejects.toThrow();
    expect(mocks.save).toHaveBeenCalledWith(
      'data:image/webp;base64,raw',
      'capture.original.webp',
      1,
      'temporary'
    );
  } finally {
    admission.release();
  }
});
it('omits unavailable page metadata and keeps legacy desktop output unchanged', async () => {
  mocks.tab.mockRejectedValue(new Error('tab closed'));
  const admission = beginPageAppearance(1, 'tx');
  try {
    await admission.prepare!('raw', 'capture.png');
    expect(mocks.render.mock.calls[0]![0].metadata).not.toHaveProperty('url');
    expect(mocks.render.mock.calls[0]![0].metadata).not.toHaveProperty('title');
  } finally {
    admission.release();
  }
  await expect(
    prepareDesktopAppearance(
      { imageFormat: 'png', imageQuality: 90 },
      getMediaAuthorityGeneration()
    )('raw', 'old.png')
  ).resolves.toEqual({ dataUrl: 'raw', filename: 'old.png' });
});

it('applies a local clipboard PNG override before rendering without changing the action snapshot', async () => {
  const snapshot = { ...output(), imageFormat: 'jpeg' as const, imageQuality: 72 };
  mocks.snapshot.mockReturnValue(snapshot);
  const admission = beginPageAppearance(1, 'tx', 'png');
  try {
    await expect(admission.prepare!('data:image/png;base64,crop', 'capture.jpg')).resolves.toEqual({
      dataUrl: 'styled',
      filename: 'capture.png',
    });
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({ imageFormat: 'png', imageQuality: 72 })
    );
    expect(snapshot.imageFormat).toBe('jpeg');
    expect(mocks.current).toHaveBeenCalledWith(1, 'tx');
  } finally {
    admission.release();
  }
});

it('retains the lossless full-page source when the final appearance exceeds its selected file budget', async () => {
  loadSettingsMock.mockResolvedValue({ fullPageQuality: { maxFileSizeMiB: 8 } });
  mocks.render.mockImplementation(async (options: QuickActionRasterOptions) => {
    expect(options.maxEncodedBytes).toBe(8 * 1024 * 1024);
    throw new Error('Full-page screenshot exceeds the configured maximum file size');
  });
  const admission = beginPageAppearance(1, 'tx', undefined, true);
  try {
    await expect(admission.prepare!('data:image/png;base64,raw', 'capture.jpg')).rejects.toThrow();
    expect(mocks.save).toHaveBeenCalledWith(
      'data:image/png;base64,raw',
      'capture.original.png',
      1,
      'temporary'
    );
    expect(mocks.render).toHaveBeenCalledOnce();
  } finally {
    admission.release();
  }
});
