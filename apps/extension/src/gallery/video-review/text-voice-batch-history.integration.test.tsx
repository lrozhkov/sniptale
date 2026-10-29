// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewTextVoiceOperation } from './use-text-voice';
import { createTextTakeBatchFixture } from '../../workflows/video-review/text-take-batch.test-support';
import type { ReviewTextVoicePreview } from '../../workflows/video-review/text-voice';

const io = vi.hoisted(() => ({
  prepare: vi.fn(),
  generate: vi.fn(),
  discard: vi.fn(),
  event: vi.fn(),
}));
vi.mock('../../composition/persistence/projects', () => ({ prepareProjectAsset: io.prepare }));
vi.mock('../../composition/persistence/assets/audio-staging', () => ({
  discardAudioStaging: io.discard,
}));
vi.mock('../../features/media-hub/events', () => ({ publishMediaHubLibraryChanged: io.event }));
vi.mock('../../workflows/video-review/text-voice', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/text-voice')>()),
  generateReviewTextVoice: io.generate,
}));
let root: Root | undefined;
let host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal(
    'AudioContext',
    class {
      async decodeAudioData() {
        return { duration: 1 };
      }
      async close() {}
    }
  );
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:take'), revokeObjectURL: vi.fn() });
  io.discard.mockResolvedValue(undefined);
  io.prepare.mockImplementation(async () => ({
    id: `prepared-${io.prepare.mock.calls.length}`,
    protect: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
  }));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { count: 2, retry: false },
  { count: 10, retry: false },
  { count: 2, retry: true },
])(
  'actual authored AI Apply accepts $count previews as one history action, retry=$retry',
  async ({ count, retry }) => {
    const fixture = createTextTakeBatchFixture(count);
    const { session, previews } = fixture;
    if (retry)
      io.prepare.mockImplementation(async () => {
        const index = io.prepare.mock.calls.length;
        const handle = {
          id: `prepared-${index}`,
          protect: vi.fn(async () => undefined),
          publish: vi.fn(async () => undefined),
          cancel: vi.fn(async () => undefined),
          discard: vi.fn(async () => undefined),
        };
        if (index === 2) handle.publish.mockRejectedValueOnce(new Error('second publication'));
        return handle;
      });
    io.generate.mockImplementation(
      async (_session: unknown, id: string): Promise<ReviewTextVoicePreview> => {
        const preview = previews.find((entry) => entry.textSnapshot.textId === id);
        if (!preview) throw new Error('fixture preview missing');
        return preview;
      }
    );
    const beforeRequest = vi.fn(async () => undefined);
    let current: ReturnType<typeof useReviewTextVoiceOperation> | undefined;
    let ids = previews.map((entry) => entry.textSnapshot.textId);
    function Harness() {
      current = useReviewTextVoiceOperation({
        access: { session, beforeRequest, sourceAudioAvailable: () => true },
        ids,
      });
      return null;
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<Harness />));
    await act(async () =>
      current?.generate(
        { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3' },
        {
          modelId: 'model',
          approvedProviderId: 'provider',
          approvedModelCode: 'speech',
          approvedDestination: `sha256:${'a'.repeat(64)}`,
        }
      )
    );
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(current?.previews).toHaveLength(count);
      expect(current?.running).toBe(false);
    });
    await act(async () => current?.setMuteSource(true));
    beforeRequest.mockClear();
    const before = session.getSnapshot().snapshot.workspace.history.length;
    await act(async () => {
      await current?.apply(previews);
    });
    if (retry) {
      expect(current?.error).toBe('failed');
      expect(current?.accepted).toHaveLength(0);
      expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(count);
      ids = [];
      await act(async () => root?.render(<Harness />));
      await act(async () => current?.setMuteSource(false));
      await act(async () => {
        await current?.apply([previews[0]!]);
      });
      expect(io.prepare).toHaveBeenCalledTimes(count);
      expect(io.generate).toHaveBeenCalledTimes(count);
    }
    expect(current?.error).toBeNull();
    expect(current?.accepted).toHaveLength(count);
    expect(beforeRequest).toHaveBeenCalledOnce();
    expect(fixture.commit).toHaveBeenCalledOnce();
    expect(io.prepare.mock.calls.map((call) => call[5])).toEqual(
      previews.map((preview) => ({
        aggregateId: 'review-batch',
        clipId: preview.clipId,
      }))
    );
    expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(before + 1);
    expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(count);
    expect(
      session
        .getSnapshot()
        .document.advancedContent.audio.original.mutes?.map((mute) =>
          mute.kind === 'take' ? mute.clipId : ''
        )
    ).toEqual(previews.map((preview) => preview.clipId));
    await act(async () => {
      await session.history('undo');
    });
    expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(0);
    expect(session.getSnapshot().document.advancedContent.audio.original.mutes).toBeUndefined();
    await act(async () => {
      await session.history('redo');
    });
    expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(count);
    expect(session.getSnapshot().document.advancedContent.audio.original.mutes).toHaveLength(count);
  }
);
