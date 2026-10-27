// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import type { VoiceHistoryEntry } from '@sniptale/runtime-contracts/voice-input';
import { VoiceInputHistoryPanel } from './history';
import type { VoiceHistoryDependencies } from './use-voice-history';

vi.mock('../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
const entry: VoiceHistoryEntry = {
  entryId: 'entry',
  incarnation: 'incarnation',
  epoch: 'epoch',
  revision: 1,
  audioDigest: `sha256:${'a'.repeat(64)}`,
  sequence: 1,
  createdAt: 1,
  backend: 'browser',
  language: 'ru-RU',
  durationSeconds: 2,
  byteLength: 100,
  mimeType: 'audio/wav',
  rawTranscript: 'raw',
  transcript: 'accepted',
  status: 'processing',
  correctionStatus: 'off',
  failureCode: null,
};
let container: HTMLDivElement;
let root: Root;
function button(selector: string) {
  return container.querySelector<HTMLButtonElement>(
    `[data-ui="settings.voice.history-${selector}"]`
  )!;
}
function fixture() {
  const client = {
    list: vi.fn().mockResolvedValue([entry]),
    retry: vi.fn().mockResolvedValue({ ...entry, revision: 2 }),
    remove: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  };
  const deps: VoiceHistoryDependencies = {
    createClient: () => client,
    copy: vi.fn().mockResolvedValue(undefined),
    readAudio: vi.fn().mockResolvedValue(new File(['audio'], 'voice.wav')),
    createObjectURL: vi.fn().mockReturnValue('blob:audio'),
    revokeObjectURL: vi.fn(),
  };
  return {
    client,
    deps,
    async render(refreshToken = 0, canRetry?: boolean, showRetry = true) {
      await act(async () =>
        root.render(
          <CommandPressScope value>
            <VoiceInputHistoryPanel
              showRetry={showRetry}
              dependencies={deps}
              refreshToken={refreshToken}
              {...(canRetry === undefined ? {} : { canRetry })}
            />
          </CommandPressScope>
        )
      );
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('private voice history panel', () => {
  it('keeps persisted processing recoverable, displays metadata and copies accepted transcript', async () => {
    const f = fixture();
    await f.render(0, true);
    expect(container.textContent).toContain('accepted');
    expect(container.querySelector('time')).toBeTruthy();
    expect(button('retry').disabled).toBe(false);
    await act(async () => button('copy').click());
    expect(f.deps.copy).toHaveBeenCalledWith('accepted');
    await act(async () => button('retry').click());
    expect(f.client.retry).toHaveBeenCalledOnce();
  });
  it('keeps model metadata out of the history header', async () => {
    const f = fixture();
    await f.render(0, true);
    expect(container.querySelector('dl')).toBeNull();
    expect(container.textContent).not.toContain('settings.voiceInput.historyRetryModel');
  });

  it('requires an explicit saved-audio transcription capability before Retry', async () => {
    const f = fixture();
    await f.render();
    expect(button('retry').disabled).toBe(true);
    expect(container.textContent).toContain('settings.voiceInput.historyRetryUnavailable');
    act(() => button('retry').click());
    expect(f.client.retry).not.toHaveBeenCalled();
    await f.render(0, true);
    expect(button('retry').disabled).toBe(false);
    expect(container.textContent).not.toContain('settings.voiceInput.historyRetryUnavailable');
  });

  it('requires explicit confirmation for permanent delete and focuses Cancel', async () => {
    const f = fixture();
    await f.render();
    act(() => button('delete').click());
    expect(f.client.remove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('delete-cancel'));
    act(() => button('delete-cancel').click());
    expect(button('delete-confirm')).toBeNull();
    act(() => button('delete').click());
    await act(async () => button('delete-confirm').click());
    expect(f.client.remove).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-entry-id]')).toBeNull();
  });
  it('installs native playback only after Play and revokes it on Stop', async () => {
    const f = fixture();
    await f.render();
    expect(container.querySelector('audio')).toBeNull();
    await act(async () => button('play').click());
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:audio');
    expect(container.querySelector('audio')?.controls).toBe(true);
    act(() => button('play').click());
    expect(container.querySelector('audio')).toBeNull();
    expect(f.deps.revokeObjectURL).toHaveBeenCalledWith('blob:audio');
  });
  it('keeps Delete reachable during retry and removes the row after confirmation', async () => {
    const f = fixture();
    let finish!: (entry: VoiceHistoryEntry) => void;
    f.client.retry.mockReturnValue(
      new Promise<VoiceHistoryEntry>((resolve) => {
        finish = resolve;
      })
    );
    await f.render(0, true);
    act(() => button('retry').click());
    expect(button('retry').disabled).toBe(true);
    expect(button('delete').disabled).toBe(false);
    act(() => button('delete').click());
    expect(button('delete-confirm').disabled).toBe(false);
    await act(async () => button('delete-confirm').click());
    expect(container.querySelector('[data-entry-id]')).toBeNull();
    await act(async () => finish({ ...entry, revision: 4 }));
    expect(container.querySelector('[data-entry-id]')).toBeNull();
  });

  it('discloses failed correction while preserving the raw fallback transcript', async () => {
    const f = fixture();
    f.client.list.mockResolvedValueOnce([
      { ...entry, correctionStatus: 'failed', transcript: null },
    ]);
    await f.render();
    expect(container.textContent).toContain('raw');
    expect(container.textContent).toContain('settings.voiceInput.historyCorrectionFailed');
  });

  it('refreshes newly completed recordings when the session phase changes', async () => {
    const f = fixture();
    f.client.list.mockResolvedValueOnce([]);
    await f.render();
    expect(container.querySelector('[data-entry-id]')).toBeNull();
    await f.render(1);
    expect(container.querySelector('[data-entry-id]')).toBeTruthy();
    expect(f.client.list).toHaveBeenCalledTimes(2);
  });

  it('preserves completed rows on retry failure and permits explicit retry', async () => {
    const f = fixture();
    await f.render(0, true);
    f.client.retry.mockRejectedValueOnce(new Error('provider-unavailable'));
    await act(async () => button('retry').click());
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.textContent).toContain('accepted');
    expect(button('retry').disabled).toBe(false);
  });
});

it('keeps Chrome history readable without model retry controls and restores them on return', async () => {
  const f = fixture();
  await f.render(0, true, false);
  expect(button('retry')).toBeNull();
  expect(button('play')).not.toBeNull();
  expect(button('copy')).not.toBeNull();
  expect(button('delete')).not.toBeNull();
  expect(container.textContent).not.toContain('Speech model');
  expect(container.textContent).not.toContain('settings.voiceInput.historyRetryUnavailable');
  await f.render(0, true, true);
  expect(button('retry').disabled).toBe(false);
  expect(container.textContent).not.toContain('Speech model');
  expect(f.client.remove).not.toHaveBeenCalled();
});

it('uses named icon actions, offers audio download and has no manual refresh', async () => {
  const f = fixture();
  f.deps.download = vi.fn();
  await f.render(0, true);
  for (const name of ['play', 'copy', 'download', 'retry', 'delete']) {
    const action = button(name);
    expect(action.getAttribute('aria-label')).toBeTruthy();
    expect(action.querySelector('svg')).not.toBeNull();
    expect(action.textContent).toBe('');
  }
  expect(button('refresh')).toBeNull();
  await act(async () => button('download').click());
  expect(f.deps.download).toHaveBeenCalledWith(expect.any(File), 'dictation-1.wav');
  expect(f.client.remove).not.toHaveBeenCalled();
});

it('expands overflowing text without changing the full copy value', async () => {
  const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100);
  const visible = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60);
  try {
    const f = fixture();
    const text = 'A long dictated sentence. '.repeat(40);
    f.client.list.mockResolvedValue([{ ...entry, transcript: text }]);
    await f.render();
    const paragraph = container.querySelector<HTMLElement>(
      '[data-ui="settings.voice.history-text"]'
    )!;
    expect(paragraph.style.userSelect).toBe('text');
    expect(paragraph.textContent).toBe(text);
    expect(button('expand')).not.toBeNull();
    act(() => button('expand').click());
    expect(paragraph.className).not.toContain('line-clamp');
    expect(paragraph.textContent).toBe(text);
    await act(async () => button('copy').click());
    expect(f.deps.copy).toHaveBeenCalledWith(text);
  } finally {
    height.mockRestore();
    visible.mockRestore();
  }
});

it('explains retained quota failure while keeping accepted text and explicit retry', async () => {
  const f = fixture();
  f.client.list.mockResolvedValueOnce([
    { ...entry, status: 'failed', failureCode: 'provider-quota-exceeded' },
  ]);
  await f.render(0, true);
  expect(container.textContent).toContain('settings.aiProviders.providerStatusQuota');
  expect(container.textContent).toContain('accepted');
  expect(button('retry').disabled).toBe(false);
  expect(f.client.retry).not.toHaveBeenCalled();
});
