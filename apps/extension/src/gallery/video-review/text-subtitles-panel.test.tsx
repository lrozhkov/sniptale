// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTextSubtitlesForm } from './text-subtitles-panel';
import { ReviewIntervalMap } from './interval-timing';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewTextDocument } from '../../features/video/review/text-types';

const download = vi.hoisted(() => vi.fn());
vi.mock('../shared/download', () => ({ downloadGalleryBlob: download }));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: Root;
const documentText: ReviewTextDocument = {
  version: 1,
  fragments: [
    {
      id: 'hidden',
      text: 'Скрытый текст',
      originalText: '',
      start: 1,
      end: 3,
      timeDomain: 'result',
      revision: 0,
      timingRevision: 0,
      alignment: 'manual',
      showInVideo: false,
    },
    {
      id: 'shown',
      text: 'Shown text',
      originalText: '',
      start: 4,
      end: 5,
      timeDomain: 'result',
      revision: 0,
      timingRevision: 0,
      alignment: 'range',
      showInVideo: true,
      language: 'en',
    },
  ],
};
const button = (key: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="gallery.videoReview.${key}"]`)!;
function render(
  options: {
    offset?: number | null;
    map?: boolean;
    disabled?: boolean;
    whole?: boolean;
    ids?: string[];
    document?: ReviewTextDocument;
  } = {}
) {
  act(() =>
    root.render(
      <ReviewIntervalMap.Provider
        value={options.map === false ? undefined : buildReviewTimeMap(10, [])}
      >
        <ReviewTextSubtitlesForm
          document={options.document ?? documentText}
          ids={options.ids ?? ['hidden']}
          wholeDocument={options.whole ?? true}
          mainOffset={options.offset === undefined ? 0 : options.offset}
          disabled={options.disabled ?? false}
          onClose={vi.fn()}
        />
      </ReviewIntervalMap.Provider>
    )
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  download.mockReset();
});

async function select(key: string, text: string) {
  act(() => button(key).click());
  await vi.waitFor(() =>
    expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0)
  );
  const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (entry) => entry.textContent === text
  )!;
  act(() => option.click());
}

it('selects explicit language and format, with recoverable normalization refusal and bounded preview', async () => {
  render();
  await select('subtitlesLanguage', 'en');
  expect(host.textContent).toContain('gallery.videoReview.subtitlesCount');
  act(() => button('subtitlesDownload').click());
  const blob: Blob = download.mock.calls[0]?.[0];
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  expect(text).toContain('Shown text');
  expect(text).not.toContain('Скрытый текст');
  act(() => download.mock.calls[0]?.[4]('unconfirmed'));
  await select('subtitlesLanguage', 'gallery.videoReview.subtitlesAllLanguages');
  const large: ReviewTextDocument = {
    version: 1,
    fragments: Array.from({ length: 150 }, (_, index) => ({
      ...documentText.fragments[0]!,
      id: String(index),
      start: 1 + index * 0.001,
      end: 3,
      text: 'A'.repeat(1500),
    })),
  };
  render({ document: large });
  await select('subtitlesFormat', 'gallery.videoReview.subtitlesSrt');
  const toggle = () =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.subtitlesNormalize"]')!;
  act(() => toggle().click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('subtitlesUnavailable');
  expect(toggle()).not.toBeNull();
  expect(button('subtitlesDownload').disabled).toBe(true);
  act(() => toggle().click());
  expect(button('subtitlesDownload').disabled).toBe(false);
  expect(host.querySelector('pre')!.textContent!.length).toBe(4000);
  expect(host.textContent).toContain('gallery.videoReview.subtitlesPreviewLimited');
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('exports whole current document including hidden text without Save or project mutation', async () => {
  const before = structuredClone(documentText);
  render({ offset: 0.5 });
  expect(host.textContent).toContain('gallery.videoReview.recognitionApproximate');
  act(() => button('subtitlesDownload').click());
  expect(download).toHaveBeenCalledOnce();
  expect(download.mock.calls[0]?.[1]).toBe('subtitles.vtt');
  const blob: Blob = download.mock.calls[0]?.[0];
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  expect(text).toContain('Скрытый текст');
  expect(text).toContain('Shown text');
  expect(text).toContain('00:00:01.500 --> 00:00:03.500');
  expect(documentText).toEqual(before);
});

it('limits selected scope and applies only-shown solely to disposable file cues', () => {
  render({ whole: false, ids: ['hidden'] });
  expect(button('subtitlesDownload').disabled).toBe(false);
  act(() => host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  expect(button('subtitlesDownload').disabled).toBe(true);
  expect(documentText.fragments[0]?.showInVideo).toBe(false);
});

it('refuses unavailable clocks, no time map, and busy state without a download', () => {
  for (const options of [{ offset: null }, { map: false }, { disabled: true }]) {
    render(options);
    act(() => button('subtitlesDownload').click());
    expect(download).not.toHaveBeenCalled();
    expect(button('subtitlesDownload').disabled).toBe(true);
  }
});

it('blocks duplicate launch and surfaces interruption with retry, independent of release failure', () => {
  render();
  act(() => button('subtitlesDownload').click());
  expect(button('subtitlesDownload').disabled).toBe(true);
  act(() => button('subtitlesDownload').click());
  expect(download).toHaveBeenCalledOnce();
  act(() => download.mock.calls[0]?.[4]('interrupted'));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.videoReview.subtitlesDownloadFailed'
  );
  act(() => button('subtitlesDownload').click());
  expect(download).toHaveBeenCalledTimes(2);
  act(() => download.mock.calls[1]?.[4]('complete'));
  expect(host.textContent).toContain('gallery.videoReview.subtitlesDownloaded');
});

it('retains options on immediate failure and ignores terminal UI update after leaving', () => {
  download.mockImplementationOnce(() => {
    throw new Error('download failed');
  });
  render();
  act(() => button('subtitlesDownload').click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('subtitlesDownloadFailed');
  act(() => button('subtitlesDownload').click());
  const finished = download.mock.calls[1]?.[4];
  act(() => root.render(null));
  act(() => finished('complete'));
  expect(host.textContent).toBe('');
});
