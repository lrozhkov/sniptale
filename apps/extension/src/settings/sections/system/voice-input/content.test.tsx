// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { VoiceInputSettingsContent } from './content';
import type { VoiceInputSettingsController } from './controller-contract';

let container: HTMLDivElement;
let root: Root;

type ControllerOverrides = {
  actions?: Partial<VoiceInputSettingsController['actions']>;
  preferences?: Partial<VoiceInputSettingsController['preferences']>;
  status?: Omit<Partial<VoiceInputSettingsController['status']>, 'snapshot'> & {
    snapshot?: Partial<VoiceInputSettingsController['status']['snapshot']>;
  };
  transcript?: Partial<VoiceInputSettingsController['transcript']>;
};

function createController(overrides: ControllerOverrides = {}): VoiceInputSettingsController {
  const snapshot: VoiceInputSettingsController['status']['snapshot'] = {
    apiFlavor: 'standard',
    busyOwner: null,
    effectiveMode: null,
    errorCode: null,
    fallbackReason: null,
    language: 'ru-RU',
    localAvailability: 'downloadable',
    phase: 'idle',
    quality: 'dictation',
    qualitySupported: true,
    requestedMode: 'local-first',
    sessionId: null,
    ...overrides.status?.snapshot,
  };
  return {
    actions: {
      installPackage: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      requestMicrophone: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      ...overrides.actions,
    },
    preferences: {
      language: 'ru-RU',
      microphoneDeviceId: null,
      mode: 'local-first',
      saving: false,
      setLanguage: vi.fn().mockResolvedValue(undefined),
      setMicrophoneDeviceId: vi.fn().mockResolvedValue(undefined),
      setMode: vi.fn().mockResolvedValue(undefined),
      ...overrides.preferences,
    },
    status: {
      audioLevel: 0,
      audioPeaks: Array.from({ length: 16 }, () => 0),
      checking: false,
      error: null,
      installing: false,
      microphoneAccess: 'prompt',
      microphones: [],
      microphonesLoading: false,
      ...overrides.status,
      snapshot,
    },
    transcript: {
      finalText: '',
      interimText: '',
      setFinalText: vi.fn(),
      ...overrides.transcript,
    },
  };
}

function render(controller: VoiceInputSettingsController): void {
  act(() => root.render(<VoiceInputSettingsContent {...controller} />));
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(label)
  );
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('voice input Settings content', () => {
  it('requires microphone permission and exposes disclosure and language controls', () => {
    const controller = createController();
    render(controller);

    expect(button('settings.voiceInput.start')?.disabled).toBe(true);
    expect(button('settings.voiceInput.allowMicrophone')).toBeTruthy();
    expect(button('settings.voiceInput.install')).toBeUndefined();
    expect(container.textContent).toContain('settings.voiceInput.localDisclosure');
    expect(container.textContent).toContain('settings.voiceInput.browserDisclosure');
    expect(container.textContent).not.toContain('settings.voiceInput.clear');
    expect(container.querySelectorAll('select')).toHaveLength(3);

    render(createController({ status: { microphoneAccess: 'granted' } }));
    expect(button('settings.voiceInput.install')).toBeTruthy();
  });

  it('shows interim plus final text read-only while listening and supports explicit stop', () => {
    const controller = createController({
      status: {
        microphoneAccess: 'granted',
        snapshot: { effectiveMode: 'local', phase: 'listening', sessionId: 'session-1' },
      },
      transcript: { finalText: 'Готово. ', interimText: 'Промежуточно' },
    });
    render(controller);

    const textarea = container.querySelector('textarea');
    expect(textarea?.value).toBe('Готово. Промежуточно');
    expect(textarea?.readOnly).toBe(true);
    act(() => button('settings.voiceInput.stop')?.click());
    expect(controller.actions.stop).toHaveBeenCalledOnce();
  });

  it('keeps the owned checking session stoppable without exposing duplicate Start', () => {
    const controller = createController({
      status: {
        microphoneAccess: 'granted',
        snapshot: { phase: 'checking', sessionId: 'session-1' },
      },
    });
    render(controller);

    expect(button('settings.voiceInput.microphoneActive')).toBeTruthy();
    expect(button('settings.voiceInput.stop')).toBeTruthy();
    act(() => button('settings.voiceInput.stop')?.click());
    expect(controller.actions.stop).toHaveBeenCalledOnce();
  });

  it('surfaces media contention as an alert', () => {
    render(
      createController({
        status: {
          microphoneAccess: 'granted',
          snapshot: { busyOwner: 'video-recording' },
        },
      })
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'settings.voiceInput.busyVideo'
    );
  });

  it('does not report its own active microphone lease as contention', () => {
    render(
      createController({
        status: {
          microphoneAccess: 'granted',
          snapshot: {
            busyOwner: 'speech-recognition',
            phase: 'starting',
            sessionId: 'owned-session',
          },
        },
      })
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();

    render(
      createController({
        status: {
          microphoneAccess: 'granted',
          snapshot: { busyOwner: 'speech-recognition', errorCode: 'busy-speech' },
        },
      })
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'settings.voiceInput.busySpeech'
    );
  });

  it('selects a concrete microphone without rendering its device id as a label', () => {
    const controller = createController({
      status: {
        microphoneAccess: 'granted',
        microphones: [{ deviceId: 'private-device-id', label: 'Desk microphone' }],
      },
    });
    render(controller);
    const microphoneSelect = container.querySelector('select');
    expect(microphoneSelect?.textContent).toContain('Desk microphone');
    expect(microphoneSelect?.textContent).not.toContain('private-device-id');
    act(() => {
      if (!microphoneSelect) return;
      microphoneSelect.value = 'private-device-id';
      microphoneSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(controller.preferences.setMicrophoneDeviceId).toHaveBeenCalledWith('private-device-id');
  });

  it('keeps a short press active and stops a held push-to-talk press on release', () => {
    vi.useFakeTimers();
    const controller = createController({ status: { microphoneAccess: 'granted' } });
    render(controller);
    const microphoneButton = button('settings.voiceInput.start')!;
    const shortDown = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(shortDown, 'pointerId', { value: 1 });
    const shortUp = new MouseEvent('pointerup', { bubbles: true, button: 0 });
    Object.defineProperty(shortUp, 'pointerId', { value: 1 });
    act(() => {
      microphoneButton.dispatchEvent(shortDown);
      vi.advanceTimersByTime(100);
      microphoneButton.dispatchEvent(shortUp);
    });
    expect(controller.actions.start).toHaveBeenCalledOnce();
    expect(controller.actions.stop).not.toHaveBeenCalled();

    const heldDown = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(heldDown, 'pointerId', { value: 2 });
    const heldUp = new MouseEvent('pointerup', { bubbles: true, button: 0 });
    Object.defineProperty(heldUp, 'pointerId', { value: 2 });
    act(() => {
      microphoneButton.dispatchEvent(heldDown);
      vi.advanceTimersByTime(450);
    });
    expect(button('settings.voiceInput.releaseToStop')).toBeTruthy();
    act(() => {
      microphoneButton.dispatchEvent(heldUp);
    });
    expect(controller.actions.start).toHaveBeenCalledTimes(2);
    expect(controller.actions.stop).toHaveBeenCalledOnce();
  });

  it('renders real centered amplitude peaks and explicitly reports detected voice', () => {
    render(
      createController({
        status: {
          audioLevel: 0.42,
          audioPeaks: Array.from({ length: 16 }, (_, index) => (index + 1) / 16),
          microphoneAccess: 'granted',
          snapshot: { phase: 'listening', sessionId: 'session-1' },
        },
      })
    );

    const meter = container.querySelector('[role="meter"]');
    expect(meter?.getAttribute('aria-valuemax')).toBe('100');
    expect(meter?.getAttribute('aria-valuemin')).toBe('0');
    expect(meter?.getAttribute('aria-valuenow')).toBe('42');
    expect(meter?.querySelectorAll('[data-audio-peak]')).toHaveLength(16);
    expect(container.textContent).toContain('42%');
    expect(container.textContent).toContain('settings.voiceInput.signalDetected');
  });
});
