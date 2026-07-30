import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isBrowserClipboardImageFormatSupported,
  readBrowserClipboardImage,
  writeBrowserClipboardItems,
  writeBrowserClipboardText,
} from './clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser clipboard adapters', () => {
  it('falls back to png-only clipboard image support when supports() is unavailable', () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        write: vi.fn(),
      },
    });
    vi.stubGlobal('ClipboardItem', class MockClipboardItem {});

    expect(isBrowserClipboardImageFormatSupported('png')).toBe(true);
    expect(isBrowserClipboardImageFormatSupported('jpeg')).toBe(false);
    expect(isBrowserClipboardImageFormatSupported('webp')).toBe(false);
  });

  it('delegates clipboard writes to navigator.clipboard.write', async () => {
    const write = vi.fn();
    vi.stubGlobal('navigator', {
      clipboard: {
        write,
      },
    });

    const items = [{}] as ClipboardItem[];
    await writeBrowserClipboardItems(items);

    expect(write).toHaveBeenCalledWith(items);
  });

  it('delegates text writes and rejects an unavailable text clipboard', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await writeBrowserClipboardText('annotations');
    expect(writeText).toHaveBeenCalledWith('annotations');

    vi.stubGlobal('navigator', { clipboard: {} });
    await expect(writeBrowserClipboardText('annotations')).rejects.toThrow(
      'Clipboard text write is unavailable.'
    );
  });

  it('reads the first image item from navigator.clipboard.read', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });
    const read = vi.fn(async () => [
      { getType: vi.fn(), types: ['text/plain'] },
      { getType: vi.fn(async () => blob), types: ['image/png'] },
    ]);
    vi.stubGlobal('navigator', {
      clipboard: { read },
    });

    await expect(readBrowserClipboardImage()).resolves.toEqual({
      blob,
      mimeType: 'image/png',
    });
  });
});
