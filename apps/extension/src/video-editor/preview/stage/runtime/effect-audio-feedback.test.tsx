// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { usePreviewEffectAudio } from './effect-audio';

const mocks = vi.hoisted(() => ({
  voice: { prepare: vi.fn(), sync: vi.fn(), reset: vi.fn(), close: vi.fn() },
  action: { sync: vi.fn(), reset: vi.fn(), close: vi.fn() },
  effect: vi.fn(),
  resetEffect: vi.fn(),
  closeEffect: vi.fn(),
}));
vi.mock('./source-voiceover-audio', () => ({
  createProjectSourceVoiceoverAudioRuntime: () => mocks.voice,
}));
vi.mock('./action-audio', () => ({ createProjectActionAudioRuntime: () => mocks.action }));
vi.mock('./effect-audio-state', () => ({
  createPreviewEffectAudioState: () => ({}),
  syncPreviewEffectAudio: mocks.effect,
  resetPreviewEffectAudio: mocks.resetEffect,
  cleanupPreviewEffectAudio: mocks.closeEffect,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.voice.sync.mockResolvedValue(undefined);
  mocks.voice.prepare.mockResolvedValue(undefined);
  mocks.action.sync.mockResolvedValue(undefined);
  mocks.action.close.mockResolvedValue(undefined);
  mocks.effect.mockResolvedValue(undefined);
  mocks.closeEffect.mockResolvedValue(undefined);
});
function fixture() {
  return {
    project: createEmptyVideoProject(),
    assetUrls: {},
    currentTime: 0,
    isPlaying: true,
    feedback: {
      failed: false,
      onFailure: vi.fn(),
      onRecovery: vi.fn(),
      onRetry: vi.fn(),
      retryVersion: 0,
    },
  };
}

it.each(['voice', 'action', 'effect'] as const)(
  'keeps aggregate audio failed when the %s branch fails',
  async (branch) => {
    const args = fixture();
    const error = new Error('Audio refused');
    const sync = branch === 'effect' ? mocks.effect : mocks[branch].sync;
    sync.mockRejectedValueOnce(error);
    const hook = renderPreview(args);
    await act(async () => undefined);
    expect(args.feedback.onFailure).toHaveBeenCalledWith('audio', error);
    expect(args.feedback.onRecovery).not.toHaveBeenCalled();
    hook.rerender({ ...args, feedback: { ...args.feedback, retryVersion: 1 } });
    await act(async () => undefined);
    expect(mocks.voice.reset).toHaveBeenCalledOnce();
    expect(mocks.action.reset).toHaveBeenCalledOnce();
    expect(mocks.resetEffect).toHaveBeenCalledOnce();
    expect(args.feedback.onRecovery).toHaveBeenCalledWith('audio');
    hook.unmount();
    expect(mocks.voice.close).toHaveBeenCalledOnce();
    expect(mocks.action.close).toHaveBeenCalledOnce();
    expect(mocks.closeEffect).toHaveBeenCalledOnce();
  }
);

it('does not publish a delayed old audio failure after a new plan succeeds', async () => {
  const args = fixture();
  let reject!: (error: Error) => void;
  mocks.voice.sync.mockReturnValueOnce(
    new Promise<void>((_resolve, no) => {
      reject = no;
    })
  );
  const hook = renderPreview(args);
  hook.rerender({ ...args, currentTime: 1 });
  await act(async () => undefined);
  expect(args.feedback.onRecovery).toHaveBeenCalledWith('audio');
  await act(async () => {
    reject(new Error('Old decode failed'));
  });
  expect(args.feedback.onFailure).not.toHaveBeenCalled();
  hook.unmount();
});

function renderPreview(args: Parameters<typeof usePreviewEffectAudio>[0]) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let prepare!: ReturnType<typeof usePreviewEffectAudio>;
  function Harness(props: { value: Parameters<typeof usePreviewEffectAudio>[0] }) {
    prepare = usePreviewEffectAudio(props.value);
    return null;
  }
  const rerender = (value: Parameters<typeof usePreviewEffectAudio>[0]) => {
    act(() => root.render(<Harness value={value} />));
  };
  rerender(args);
  return {
    rerender,
    get prepare() {
      return prepare;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

it('routes a current preparation failure through the existing audio feedback owner', async () => {
  const args = fixture();
  const hook = renderPreview(args);
  await act(async () => undefined);
  const error = new Error('Voice unavailable');
  mocks.voice.prepare.mockRejectedValueOnce(error);
  await expect(
    hook.prepare({
      generation: 1,
      isPlaying: true,
      playbackRange: null,
      reason: 'play',
      signal: new AbortController().signal,
      time: 0,
    })
  ).rejects.toThrow('Voice unavailable');
  expect(args.feedback.onFailure).toHaveBeenCalledWith('audio', error);
  hook.unmount();
});

it('does not publish a late preparation failure after retry replaces the request', async () => {
  const args = fixture();
  const hook = renderPreview(args);
  await act(async () => undefined);
  let reject!: (error: Error) => void;
  mocks.voice.prepare.mockReturnValueOnce(
    new Promise<void>((_resolve, no) => {
      reject = no;
    })
  );
  const previous = hook.prepare;
  const pending = previous({
    generation: 1,
    isPlaying: true,
    playbackRange: null,
    reason: 'play',
    signal: new AbortController().signal,
    time: 0,
  }).catch((error: unknown) => error);
  hook.rerender({ ...args, feedback: { ...args.feedback, retryVersion: 1 } });
  await act(async () => undefined);
  expect(hook.prepare).not.toBe(previous);
  await act(async () => {
    reject(new Error('Previous preparation failed'));
  });
  expect(await pending).toBeUndefined();
  expect(args.feedback.onFailure).not.toHaveBeenCalled();
  hook.unmount();
});
