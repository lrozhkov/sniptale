// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';

const { productSelectSpy } = vi.hoisted(() => ({ productSelectSpy: vi.fn() }));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    'aria-label': string;
    options: { label: string; value: string }[];
    value: string;
    onChange(value: string): void;
  }) => {
    productSelectSpy(props);
    return (
      <button
        type="button"
        role="combobox"
        aria-controls="voice-input-options"
        aria-expanded="false"
        aria-label={props['aria-label']}
      >
        {props.options.find((option) => option.value === props.value)?.label}
      </button>
    );
  },
}));

vi.mock('./history', () => ({ VoiceInputHistoryPanel: () => null }));

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
      cancel: vi.fn(),
      ...overrides.actions,
    },
    models: {
      transcription: {
        models: [],
        providers: [],
        chromeAiEnabled: false,
        defaultModelId: null,
        globalSystemPrompt: '',
      },
      correction: {
        models: [],
        providers: [],
        chromeAiEnabled: false,
        defaultModelId: null,
        globalSystemPrompt: '',
      },
      transcriptionSelectionId: null,
      correctionSelectionId: null,
      loading: false,
      error: false,
      prompt: '',
      promptSaving: false,
      promptDirty: false,
      refresh: vi.fn().mockResolvedValue(undefined),
      setPrompt: vi.fn(),
      savePrompt: vi.fn().mockResolvedValue(undefined),
      resetPrompt: vi.fn().mockResolvedValue(undefined),
      selectTranscription: vi.fn().mockResolvedValue(undefined),
      selectCorrection: vi.fn().mockResolvedValue(undefined),
    },
    preferences: {
      backend: 'browser',
      transcription: null,
      correction: { enabled: false, model: null },
      setBackend: vi.fn().mockResolvedValue(undefined),
      setCorrectionEnabled: vi.fn().mockResolvedValue(undefined),
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
  act(() =>
    root.render(
      <CommandPressScope value>
        <VoiceInputSettingsContent {...controller} />
      </CommandPressScope>
    )
  );
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
  productSelectSpy.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('voice input Settings content', () => {
  it('explains unavailable local dictation without offering an impossible installation', () => {
    render(
      createController({
        status: {
          microphoneAccess: 'granted',
          snapshot: { localAvailability: 'unavailable' },
        },
      })
    );
    expect(container.textContent).toContain('settings.voiceInput.localPackageUnavailable');
    expect(container.textContent).toContain(
      'settings.voiceInput.localPackageUnavailableDescription'
    );
    expect(button('settings.voiceInput.install')).toBeUndefined();
    expect(button('settings.voiceInput.start')?.disabled).toBe(false);
  });

  it.each(['network', 'service-not-allowed'] as const)(
    'distinguishes the %s recognition error',
    (errorCode) => {
      render(createController({ status: { snapshot: { errorCode, phase: 'error' } } }));
      const expected = errorCode === 'network' ? 'errorNetwork' : 'errorServiceNotAllowed';
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        `settings.voiceInput.${expected}`
      );
    }
  );

  it('does not claim recognition is listening while only the microphone has a signal', () => {
    render(
      createController({
        status: {
          audioLevel: 0.8,
          microphoneAccess: 'granted',
          snapshot: { phase: 'starting', sessionId: 'pending-audio' },
        },
      })
    );
    expect(container.textContent).toContain('settings.voiceInput.phaseStarting');
    expect(container.textContent).not.toContain('settings.voiceInput.phaseListening');
  });

  it('requires microphone permission and exposes disclosure and language controls', () => {
    const controller = createController();
    render(controller);

    expect(button('settings.voiceInput.start')?.disabled).toBe(true);
    expect(button('settings.voiceInput.allowMicrophone')).toBeTruthy();
    expect(button('settings.voiceInput.install')).toBeUndefined();
    expect(container.textContent).toContain('settings.voiceInput.localDisclosure');
    expect(container.textContent).toContain('settings.voiceInput.browserDisclosure');
    expect(container.textContent).not.toContain('settings.voiceInput.clear');
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(3);

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
    const microphoneSelect = [...container.querySelectorAll('[role="combobox"]')].find(
      (element) => element.getAttribute('aria-label') === 'settings.voiceInput.microphoneLabel'
    );
    const microphoneProps = productSelectSpy.mock.calls.find(
      ([props]) => props['aria-label'] === 'settings.voiceInput.microphoneLabel'
    )?.[0];
    expect(microphoneProps?.options).toContainEqual({
      label: 'Desk microphone',
      value: 'private-device-id',
    });
    expect(microphoneSelect?.textContent).not.toContain('private-device-id');
    act(() => microphoneProps?.onChange('private-device-id'));
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

it('omits Chrome mode, API and local package diagnostics for the model backend', () => {
  render(createController({ preferences: { backend: 'model' } }));
  expect(container.querySelector('[aria-label="settings.voiceInput.modeLabel"]')).toBeNull();
  expect(container.textContent).not.toContain('settings.voiceInput.apiStatus');
  expect(container.textContent).not.toContain('settings.voiceInput.packageStatus');
  expect(container.textContent).not.toContain('settings.voiceInput.localDisclosure');
  expect(container.textContent).not.toContain('settings.voiceInput.browserDisclosure');
  expect(container.textContent).toContain('settings.voiceInput.microphoneStatus');
});

it('lets Chrome start despite a dormant enabled correction without a configured model', () => {
  const controller = createController({
    preferences: { backend: 'browser', correction: { enabled: true, model: null } },
    status: { microphoneAccess: 'granted' },
  });
  render(controller);
  expect(button('settings.voiceInput.start')?.disabled).toBe(false);
  expect(container.querySelector('[data-ui="settings.voice.correction"]')).toBeNull();
});
