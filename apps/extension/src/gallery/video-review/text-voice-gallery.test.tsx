// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTextVoiceGallery } from './text-voice-gallery';
import { useReviewTextVoiceOperation } from './use-text-voice';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewLocalTextVoicePreview } from '../../workflows/video-review/text-voice-local';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';

const io = vi.hoisted(() => ({
  list: vi.fn(),
  views: vi.fn(),
  read: vi.fn(),
  prepare: vi.fn(),
  apply: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('../../composition/persistence/media-library', () => ({ listMediaLibrary: io.list }));
vi.mock('../../composition/persistence/gallery-saved-views', () => ({
  listGallerySavedViews: io.views,
}));
vi.mock('../../composition/persistence/projects/library-asset-binding', () => ({
  readLibraryAudioBindingSource: io.read,
}));
vi.mock('../../workflows/video-review/text-voice-local', () => ({
  prepareReviewLocalTextVoice: io.prepare,
  applyReviewLocalTextVoice: io.apply,
}));
vi.mock('../../workflows/video-review/text-take', () => ({
  cleanupReviewTextTakePreview: io.cleanup,
}));
vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
const item: MediaLibraryItem = {
  id: 'audio',
  kind: 'audio',
  filename: 'Speech.wav',
  originalFilename: 'Speech.wav',
  createdAt: 1,
  updatedAt: 1,
  mimeType: 'audio/wav',
  size: 10,
  width: null,
  height: null,
  duration: 2,
  source: { kind: 'project-asset', projectAssetId: 'asset' },
  tags: [],
  sourceUrl: null,
  sourceTitle: null,
  sourceFavicon: null,
  hasThumbnail: false,
};
const preview: ReviewLocalTextVoicePreview = {
  clipId: 'take',
  textSnapshot: {
    kind: 'gallery',
    textId: 'text',
    revision: 0,
    timingRevision: 0,
    text: 'Narration',
    start: 1,
    end: 2,
    timeDomain: 'result',
  },
  geometry: 'geometry',
  duration: 2,
  resultStart: 1,
  blob: new Blob(['audio']),
  url: 'blob:take',
  expiresAt: Infinity,
  filename: 'Speech.wav',
};
let host: HTMLDivElement;
let root: Root;
let pause: ReturnType<typeof vi.fn>;
let createUrl: ReturnType<typeof vi.fn<(value: Blob | MediaSource) => string>>;
let revokeUrl: ReturnType<typeof vi.fn<(value: string) => void>>;
let auditionAudio: { onended: (() => void) | null } | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(),
  });
  pause = vi.fn();
  createUrl = vi.fn<(value: Blob | MediaSource) => string>(() => 'blob:audition');
  revokeUrl = vi.fn<(value: string) => void>();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    }
  );
  vi.stubGlobal('Audio', function Audio() {
    const audio = {
      onended: null as (() => void) | null,
      async play() {},
      pause,
    };
    auditionAudio = audio;
    return audio;
  });
  io.list.mockResolvedValue([item]);
  io.views.mockResolvedValue([]);
  io.read.mockResolvedValue({
    mediaId: 'audio',
    file: new File(['audio'], 'Speech.wav', { type: 'audio/wav' }),
  });
  io.prepare.mockResolvedValue(preview);
  io.apply.mockResolvedValue(undefined);
  io.cleanup.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

it('keeps the auditioned source after playback ends and the Library row is replaced', async () => {
  const auditioned = { file: new File(['A'], 'A.wav', { type: 'audio/wav' }) };
  io.read.mockResolvedValueOnce(auditioned);
  await render();
  await click('gallery.videoReview.musicPlay: Speech.wav');
  await act(async () => auditionAudio?.onended?.());
  io.read.mockResolvedValue({ file: new File(['B'], 'B.wav', { type: 'audio/wav' }) });
  await click('gallery.videoReview.musicAdd: Speech.wav');
  expect(io.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      selection: { kind: 'library', id: 'audio', auditionedSource: auditioned },
    })
  );
});

it('keeps each auditioned row when another row is played', async () => {
  const first = { mediaId: 'audio', file: new File(['A'], 'A.wav') };
  const second = { mediaId: 'second', file: new File(['B'], 'B.wav') };
  io.list.mockResolvedValue([item, { ...item, id: 'second', filename: 'Other.wav' }]);
  io.read.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await render();
  await click('gallery.videoReview.musicPlay: Speech.wav');
  await click('gallery.videoReview.musicPlay: Other.wav');
  await click('gallery.videoReview.musicAdd: Speech.wav');
  expect(io.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      selection: { kind: 'library', id: 'audio', auditionedSource: first },
    })
  );
});

it('releases audition identity on close before an unauditioned new choice', async () => {
  await render();
  await click('gallery.videoReview.musicPlay: Speech.wav');
  await click('common.actions.close');
  await click('gallery.videoReview.textVoiceChooseAudio');
  await click('gallery.videoReview.musicAdd: Speech.wav');
  expect(io.prepare).toHaveBeenCalledWith(
    expect.objectContaining({ selection: { kind: 'library', id: 'audio' } })
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  const session = createVideoReviewSession({
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced: createQuickEditAdvancedState(),
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  session.setAutosaveEnabled(false);
  const beforeRequest = vi.fn(async () => undefined);
  function Harness() {
    const operation = useReviewTextVoiceOperation({
      access: { session, beforeRequest },
      ids: ['text'],
    });
    return (
      <>
        <ReviewTextVoiceGallery operation={operation} />
        <span>{operation.previews.length}</span>
      </>
    );
  }
  await act(async () => root.render(<Harness />));
  await click('gallery.videoReview.textVoiceChooseAudio');
  return { session, beforeRequest };
}
async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}

it('opens the existing audio drawer, auditions separately, and selects only a disposable proposal', async () => {
  const { session, beforeRequest } = await render();
  expect(document.querySelector('dialog')?.getAttribute('aria-label')).toBe(
    'gallery.videoReview.textVoiceAudioGallery'
  );
  expect(document.querySelector('.sniptale-modal-title')?.textContent).toBe(
    'gallery.videoReview.textVoiceAudioGallery'
  );
  expect(beforeRequest).not.toHaveBeenCalled();
  await click('gallery.videoReview.musicPlay: Speech.wav');
  expect(io.prepare).not.toHaveBeenCalled();
  expect(createUrl).toHaveBeenCalledOnce();
  await click('gallery.videoReview.musicAdd: Speech.wav');
  expect(io.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      fragmentId: 'text',
      kind: 'gallery',
      selection: {
        kind: 'library',
        id: 'audio',
        auditionedSource: await io.read.mock.results[0]!.value,
      },
    })
  );
  expect(io.apply).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toMatchObject({ dirty: false, autosaveEnabled: false });
  expect(document.querySelector('dialog')).toBeNull();
  expect(pause).toHaveBeenCalledOnce();
  expect(revokeUrl).toHaveBeenCalledWith('blob:audition');
  await act(async () => root.render(null));
  expect(io.cleanup).toHaveBeenCalledWith(session, preview);
});

it('uploads through the same drawer and keeps it open for an explicit failed preparation retry', async () => {
  await render();
  io.prepare.mockRejectedValueOnce(new Error('duration'));
  const file = new File(['audio'], 'upload.wav', { type: 'audio/wav' });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(document.querySelector('dialog')).not.toBeNull();
  expect(io.apply).not.toHaveBeenCalled();
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(io.prepare).toHaveBeenLastCalledWith(
    expect.objectContaining({ selection: { kind: 'file', file } })
  );
  expect(document.querySelector('dialog')).toBeNull();
});

it('fences delayed audition after close and cancels a pending choice without accepting its late preview', async () => {
  let read!: (value: { file: File }) => void;
  io.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        read = resolve;
      })
  );
  await render();
  await click('gallery.videoReview.musicPlay: Speech.wav');
  await click('common.actions.close');
  await act(async () => read({ file: new File(['audio'], 'Speech.wav') }));
  expect(createUrl).not.toHaveBeenCalled();
  await click('gallery.videoReview.textVoiceChooseAudio');
  let ready!: (value: ReviewLocalTextVoicePreview) => void;
  io.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        ready = resolve;
      })
  );
  await click('gallery.videoReview.musicAdd: Speech.wav');
  const signal: AbortSignal = io.prepare.mock.calls[0]![0].signal;
  await click('common.actions.close');
  expect(signal.aborted).toBe(true);
  await act(async () => ready(preview));
  expect(io.cleanup).toHaveBeenCalledOnce();
  expect(io.apply).not.toHaveBeenCalled();
  expect(host.textContent).toContain('0');
});
