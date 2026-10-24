// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const preferenceMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('../../composition/persistence/settings', () => ({
  loadSettings: preferenceMocks.loadSettings,
  subscribeToVoiceInputPreferencesChanges: preferenceMocks.subscribe,
}));

vi.mock('../../composition/voice-input/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/voice-input/trusted-events')>()),
  isTrustedMouseEvent: vi.fn(() => true),
  isTrustedPointerEvent: vi.fn(() => true),
}));

import { ContentVoiceInputButton } from './button';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
beforeEach(() => {
  preferenceMocks.loadSettings.mockReset().mockResolvedValue({ voiceInput: {} });
  preferenceMocks.subscribe.mockReset().mockReturnValue(() => undefined);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

async function renderButton(active: boolean, onStart = vi.fn(), onStop = vi.fn()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ContentVoiceInputButton
        dataUi="voice-test"
        disabled={false}
        labels={{ error: 'Error', start: 'Start', stop: 'Stop' }}
        onStart={onStart}
        onStop={onStop}
        state={{
          active,
          pending: false,
          audioLevel: active ? 0.5 : 0,
          errorCode: null,
          phase: active ? 'listening' : 'idle',
        }}
      />
    );
  });
  return { button: container.querySelector('button')!, onStart, onStop };
}

it('exposes the click toggle and renders audio-level feedback while active', async () => {
  const idle = await renderButton(false);
  act(() => idle.button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
  expect(idle.onStart).toHaveBeenCalledOnce();

  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  const active = await renderButton(true);
  expect(active.button.getAttribute('aria-pressed')).toBe('true');
  expect(active.button.querySelector('span')).not.toBeNull();
  act(() => active.button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
  expect(active.onStop).toHaveBeenCalledOnce();
});

it('uses the contrast surface and inverse icon treatment above arbitrary page content', async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ContentVoiceInputButton
        appearance="contrast"
        dataUi="voice-contrast-test"
        disabled={false}
        labels={{ error: 'Error', start: 'Start', stop: 'Stop' }}
        onStart={vi.fn()}
        onStop={vi.fn()}
        state={{ active: false, pending: false, audioLevel: 0, errorCode: null, phase: 'idle' }}
      />
    );
  });

  const className = container.querySelector('button')?.className;
  expect(className).toContain('surface-contrast');
  expect(className).toContain('text-inverse');

  await act(async () => {
    root?.render(
      <ContentVoiceInputButton
        appearance="contrast"
        dataUi="voice-contrast-test"
        disabled={false}
        labels={{ error: 'Error', start: 'Start', stop: 'Stop' }}
        onStart={vi.fn()}
        onStop={vi.fn()}
        state={{
          active: true,
          pending: false,
          audioLevel: 0.5,
          errorCode: null,
          phase: 'listening',
        }}
      />
    );
  });

  expect(container.querySelector('button')?.className).toContain('color-accent-emphasis');
  const contrastRing = container.querySelector('button span');
  expect(contrastRing?.className.split(' ')).toContain('border');
  expect(contrastRing?.className).toContain('shadow-[0_0_7px');
  expect(Number((contrastRing as HTMLElement | null)?.style.opacity)).toBeCloseTo(0.91);
});

it('keeps the pointer stable while an internal stop is settling', async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ContentVoiceInputButton
        dataUi="voice-stopping-test"
        disabled={false}
        labels={{ error: 'Error', start: 'Start', stop: 'Stop' }}
        onStart={vi.fn()}
        onStop={vi.fn()}
        state={{ active: false, pending: true, audioLevel: 0, errorCode: null, phase: 'stopping' }}
      />
    );
  });

  const button = container.querySelector('button');
  expect(button?.disabled).toBe(true);
  expect(button?.className).toContain('disabled:cursor-pointer');
  expect(button?.className).toContain('disabled:opacity-100');
});

it('renders error and disabled states and stops an active pointer session', async () => {
  const active = await renderButton(true);
  act(() =>
    active.button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  );
  expect(active.onStop).toHaveBeenCalledOnce();

  await act(async () => {
    root?.render(
      <ContentVoiceInputButton
        appearance="contrast"
        dataUi="voice-error-test"
        disabled
        labels={{ error: 'Error', start: 'Start', stop: 'Stop' }}
        onStart={vi.fn()}
        onStop={vi.fn()}
        state={{
          active: false,
          pending: false,
          audioLevel: 0,
          errorCode: 'runtime',
          phase: 'error',
        }}
      />
    );
  });
  const error = container?.querySelector('button');
  expect(error?.title).toBe('Error');
  expect(error?.className).toContain('color-danger');
  expect(error?.className).toContain('disabled:opacity-45');
});

it('uses Cancel during processing and never restarts dictation', async () => {
  const onCancel = vi.fn();
  const onStart = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <ContentVoiceInputButton
        dataUi="processing"
        disabled={false}
        labels={{ error: 'Error', start: 'Start', stop: 'Stop' }}
        onStart={onStart}
        onStop={vi.fn()}
        onCancel={onCancel}
        state={{
          active: false,
          pending: true,
          audioLevel: 0,
          errorCode: null,
          phase: 'processing-asr',
        }}
      />
    )
  );
  act(() => container?.querySelector('button')?.click());
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onStart).not.toHaveBeenCalled();
});

it('hides dictation before preferences load and follows live enable changes', async () => {
  let resolveSettings!: (value: { voiceInput: { enabled: boolean } }) => void;
  preferenceMocks.loadSettings.mockReturnValue(
    new Promise((resolve) => {
      resolveSettings = resolve;
    })
  );
  await renderButton(false);
  expect(container?.querySelector('button')).toBeNull();
  await act(async () => resolveSettings({ voiceInput: { enabled: false } }));
  expect(container?.querySelector('button')).toBeNull();
  const notify = preferenceMocks.subscribe.mock.calls[0]?.[0];
  act(() => notify({ enabled: true }));
  expect(container?.querySelector('button')).not.toBeNull();
  act(() => notify({ enabled: false }));
  expect(container?.querySelector('button')).toBeNull();
});

it('does not overwrite a newer disabled preference with a delayed initial read', async () => {
  let resolveSettings!: (value: { voiceInput: { enabled: boolean } }) => void;
  preferenceMocks.loadSettings.mockReturnValue(
    new Promise((resolve) => {
      resolveSettings = resolve;
    })
  );
  await renderButton(false);
  const notify = preferenceMocks.subscribe.mock.calls[0]?.[0];
  act(() => notify({ enabled: false }));
  await act(async () => resolveSettings({ voiceInput: { enabled: true } }));
  expect(container?.querySelector('button')).toBeNull();
});

it('keeps dictation hidden when the saved preference cannot be read', async () => {
  preferenceMocks.loadSettings.mockRejectedValue(new Error('settings unavailable'));
  await renderButton(false);
  expect(container?.querySelector('button')).toBeNull();
});

it('resets an unfinished pointer press when dictation is disabled and enabled again', async () => {
  const control = await renderButton(false);
  act(() =>
    control.button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  );
  expect(control.onStart).toHaveBeenCalledOnce();
  const notify = preferenceMocks.subscribe.mock.calls[0]?.[0];
  act(() => notify({ enabled: false }));
  act(() => notify({ enabled: true }));
  act(() =>
    container
      ?.querySelector('button')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  );
  expect(control.onStart).toHaveBeenCalledTimes(2);
});

it('stops a click recording exactly once when the content activation bridge is installed', async () => {
  const { useState } = await import('react');
  const { installContentUiActivationBridge } = await import('../runtime/ui-activation-bridge');
  const { isTrustedMouseEvent } = await import('../../composition/voice-input/trusted-events');
  vi.mocked(isTrustedMouseEvent).mockReturnValue(false);
  const onStart = vi.fn();
  const onStop = vi.fn();
  const onCancel = vi.fn();
  function Field() {
    const [phase, setPhase] = useState<'idle' | 'listening' | 'processing-asr'>('idle');
    return (
      <ContentVoiceInputButton
        dataUi="bridged-field"
        disabled={false}
        labels={{ error: 'Error', start: 'Start', stop: 'Stop' }}
        onStart={() => {
          onStart();
          setPhase('listening');
        }}
        onStop={() => {
          onStop();
          setPhase('processing-asr');
        }}
        onCancel={onCancel}
        state={{
          active: phase === 'listening',
          pending: phase === 'processing-asr',
          audioLevel: 0,
          errorCode: null,
          phase,
        }}
      />
    );
  }
  container = document.createElement('div');
  document.body.append(container);
  const dispose = installContentUiActivationBridge(container);
  root = createRoot(container);
  await act(async () => root?.render(<Field />));
  const button = container.querySelector('button')!;
  const press = () => {
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new MouseEvent(type, { bubbles: true, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      act(() => button.dispatchEvent(event));
    }
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
  };
  try {
    press();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();
    press();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-label')).toBe(
      (await import('../../platform/i18n')).translate('settings.voiceInput.cancel')
    );
  } finally {
    dispose();
    vi.mocked(isTrustedMouseEvent).mockReturnValue(true);
  }
});
