// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  reviewSpeechTextSignature,
  type ReviewSpeechTranscript,
} from '../../features/video/review/speech-transcript';
import type { ReviewSpeechPreview } from '../../workflows/video-review/speech-publication';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), cleanup: vi.fn() }));
vi.mock('../../workflows/video-review/asset-bytes', () => ({
  resolveReviewAssetBytes: mocks.resolve,
}));
vi.mock('../../workflows/video-review/speech-publication', () => ({
  cleanupReviewSpeechPreview: mocks.cleanup,
}));
import { useSpeechPreviews } from './use-speech-previews';
let root: Root | undefined;
let host: HTMLDivElement;
let current: ReturnType<typeof useSpeechPreviews>;
const profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' as const };
const transcript: ReviewSpeechTranscript = {
  version: 1,
  profile,
  replacements: [],
  phrases: [
    {
      id: 'phrase',
      start: 0,
      end: 3,
      text: 'Text',
      originalText: 'Text',
      revision: 0,
      alignment: 'range',
    },
  ],
};
function preview(id = 'take'): ReviewSpeechPreview {
  return {
    replacement: {
      id,
      phraseId: 'phrase',
      text: 'Text',
      assetId: '',
      start: 0,
      end: 3,
      revision: 0,
      duration: 1,
      profile,
      textSignature: reviewSpeechTextSignature('Text', profile),
    },
    blob: new Blob(),
    url: `blob:${id}`,
    scope: {
      workspaceId: 'workspace',
      workspaceRevision: 1,
      target: { kind: 'voiceover' as const, clipId: 'clip' },
      assetId: 'original',
      nativeStart: 0,
      nativeEnd: 3,
    },
    staged: { id, mimeType: 'audio/wav', size: 1 },
    geometry: 'geometry',
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000,
  };
}
function Harness({
  onError,
  assetId = 'original',
  geometry = 'geometry',
}: {
  onError(): void;
  assetId?: string;
  geometry?: string;
}) {
  current = useSpeechPreviews({ assetId, transcript, geometry, onError });
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue(new Blob(['audio']));
  mocks.cleanup.mockResolvedValue(undefined);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:original');
      static revokeObjectURL = vi.fn();
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('owns original audio URLs and releases generated previews on expiry and replacement', async () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  await act(async () => root?.render(<Harness onError={onError} />));
  expect(current.originalUrl).toBe('blob:original');
  const first = preview();
  await act(async () => current.add(first));
  const second = preview('second');
  await act(async () => current.add(second));
  expect(current.previews).toEqual([second]);
  expect(mocks.cleanup).toHaveBeenCalledWith(first);
  await act(async () => vi.advanceTimersByTimeAsync(1001));
  expect(current.previews).toEqual([]);
  expect(mocks.cleanup).toHaveBeenCalledWith(second);
  act(() => root?.unmount());
  root = undefined;
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original');
  expect(onError).not.toHaveBeenCalled();
});
it('invalidates a geometry change and supports targeted or complete disposal', async () => {
  const onError = vi.fn();
  await act(async () => root?.render(<Harness onError={onError} />));
  const first = preview();
  await act(async () => current.add(first));
  await act(async () => root?.render(<Harness onError={onError} geometry="trimmed" />));
  expect(current.previews).toEqual([]);
  expect(mocks.cleanup).toHaveBeenCalledWith(first);
  await act(async () => root?.render(<Harness onError={onError} />));
  const second = preview('second');
  await act(async () => current.add(second));
  await act(async () => current.invalidate(['other']));
  expect(current.previews).toEqual([second]);
  await act(async () => current.invalidate());
  expect(current.previews).toEqual([]);
  const late = preview('late');
  act(() => current.discard(late));
  expect(mocks.cleanup).toHaveBeenCalledWith(late);
});
it('ignores an original asset resolving after unmount and reports active read failures', async () => {
  const onError = vi.fn();
  let resolve: (blob: Blob) => void = () => undefined;
  mocks.resolve.mockImplementationOnce(
    () =>
      new Promise<Blob>((done) => {
        resolve = done;
      })
  );
  await act(async () => root?.render(<Harness onError={onError} />));
  act(() => root?.unmount());
  root = undefined;
  await act(async () => resolve(new Blob()));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  mocks.resolve.mockRejectedValueOnce(new Error('missing'));
  root = createRoot(host);
  await act(async () => root?.render(<Harness onError={onError} />));
  expect(onError).toHaveBeenCalledOnce();
});
