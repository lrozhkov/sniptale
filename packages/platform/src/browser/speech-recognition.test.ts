import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSpeechRecognitionSession,
  installSpeechRecognitionLanguage,
  loadSpeechRecognitionAvailability,
  resolveSpeechRecognitionApi,
} from './speech-recognition';

type CallbackMap = {
  onaudiostart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: unknown) => void) | null;
  onstart: (() => void) | null;
};

function installRecognitionGlobal(args: {
  available?: (options: unknown) => Promise<string>;
  install?: (options: unknown) => Promise<boolean>;
  prefixed?: boolean;
}) {
  const instances: Array<
    CallbackMap & {
      abort: ReturnType<typeof vi.fn>;
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      maxAlternatives: number;
      processLocally?: boolean;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }
  > = [];
  class Recognition {
    static available = args.available;
    static install = args.install;
    abort = vi.fn();
    continuous = true;
    interimResults = false;
    lang = '';
    maxAlternatives = 0;
    onaudiostart: CallbackMap['onaudiostart'] = null;
    onend: CallbackMap['onend'] = null;
    onerror: CallbackMap['onerror'] = null;
    onresult: CallbackMap['onresult'] = null;
    onstart: CallbackMap['onstart'] = null;
    processLocally = false;
    start = vi.fn();
    stop = vi.fn();

    constructor() {
      instances.push(this);
    }
  }
  vi.stubGlobal(args.prefixed ? 'webkitSpeechRecognition' : 'SpeechRecognition', Recognition);
  return instances;
}

function useChromeVersion(version: number): void {
  vi.stubGlobal('navigator', { userAgent: `Mozilla/5.0 Chrome/${version}.0.0.0` });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('speech recognition browser adapter', () => {
  it('prefers the standard API and reports prefixed and unsupported variants', () => {
    installRecognitionGlobal({});
    vi.stubGlobal('webkitSpeechRecognition', class {});
    expect(resolveSpeechRecognitionApi().flavor).toBe('standard');

    vi.stubGlobal('SpeechRecognition', undefined);
    expect(resolveSpeechRecognitionApi().flavor).toBe('prefixed');

    vi.stubGlobal('webkitSpeechRecognition', undefined);
    expect(resolveSpeechRecognitionApi().flavor).toBe('unsupported');
  });

  it('requests fixed dictation quality for local availability and install in Chrome 150', async () => {
    useChromeVersion(150);
    const available = vi.fn().mockResolvedValue('downloadable');
    const install = vi.fn().mockResolvedValue(true);
    installRecognitionGlobal({ available, install });

    await expect(
      loadSpeechRecognitionAvailability({ language: 'ru-RU', processLocally: true })
    ).resolves.toMatchObject({ availability: 'downloadable', qualitySupported: true });
    await expect(installSpeechRecognitionLanguage('ru-RU')).resolves.toBe(true);
    expect(available).toHaveBeenCalledWith({
      langs: ['ru-RU'],
      processLocally: true,
      quality: 'dictation',
    });
    expect(install).toHaveBeenCalledWith({
      langs: ['ru-RU'],
      processLocally: true,
      quality: 'dictation',
    });
  });

  it('does not probe or install command-quality local packs on older Chromium', async () => {
    useChromeVersion(149);
    const available = vi.fn().mockResolvedValue('available');
    const install = vi.fn().mockResolvedValue(true);
    installRecognitionGlobal({ available, install });

    await expect(
      loadSpeechRecognitionAvailability({ language: 'en-US', processLocally: true })
    ).resolves.toMatchObject({ availability: 'unsupported', qualitySupported: false });
    await expect(installSpeechRecognitionLanguage('en-US')).rejects.toMatchObject({
      reason: 'local-unsupported',
    });
    expect(available).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it('normalizes unsupported and unknown availability without assuming legacy failure', async () => {
    useChromeVersion(150);
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    await expect(
      loadSpeechRecognitionAvailability({ language: 'ru-RU', processLocally: true })
    ).resolves.toMatchObject({ apiFlavor: 'unsupported', availability: 'unsupported' });

    installRecognitionGlobal({});
    await expect(
      loadSpeechRecognitionAvailability({ language: 'ru-RU', processLocally: true })
    ).resolves.toMatchObject({ availability: 'unsupported' });
    await expect(
      loadSpeechRecognitionAvailability({ language: 'ru-RU', processLocally: false })
    ).resolves.toMatchObject({ availability: 'unknown' });

    installRecognitionGlobal({ available: vi.fn().mockResolvedValue('future-status') });
    await expect(
      loadSpeechRecognitionAvailability({ language: 'en-US', processLocally: true })
    ).resolves.toMatchObject({ availability: 'unknown' });
  });

  it('preserves false install outcomes and rejects when local installation is unsupported', async () => {
    useChromeVersion(150);
    installRecognitionGlobal({ install: vi.fn().mockResolvedValue(false) });
    await expect(installSpeechRecognitionLanguage('en-US')).resolves.toBe(false);

    vi.stubGlobal('SpeechRecognition', class {});
    await expect(installSpeechRecognitionLanguage('en-US')).rejects.toMatchObject({
      reason: 'local-unsupported',
    });

    installRecognitionGlobal({ install: vi.fn().mockRejectedValue('private browser detail') });
    await expect(installSpeechRecognitionLanguage('ru-RU')).rejects.toMatchObject({
      reason: 'unexpected',
    });
  });

  it('configures a one-shot session and removes every listener on disposal', () => {
    useChromeVersion(150);
    const instances = installRecognitionGlobal({});
    const callbacks = {
      onAudioStart: vi.fn(),
      onEnd: vi.fn(),
      onError: vi.fn(),
      onResult: vi.fn(),
      onStart: vi.fn(),
    };
    const session = createSpeechRecognitionSession({
      audioTrack: { id: 'selected-track' } as MediaStreamTrack,
      callbacks,
      language: 'ru-RU',
      processLocally: true,
    });
    const recognition = instances[0]!;

    expect(recognition).toMatchObject({
      continuous: false,
      interimResults: true,
      lang: 'ru-RU',
      maxAlternatives: 1,
      processLocally: true,
    });
    session.start();
    session.stop();
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(recognition.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selected-track' })
    );
    expect(recognition.stop).toHaveBeenCalledOnce();
    session.dispose();
    expect(recognition.onaudiostart).toBeNull();
    expect(recognition.onstart).toBeNull();
    expect(recognition.onend).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onresult).toBeNull();
  });

  it('forwards lifecycle, errors, and every valid result while normalizing confidence', () => {
    const instances = installRecognitionGlobal({});
    const callbacks = {
      onAudioStart: vi.fn(),
      onEnd: vi.fn(),
      onError: vi.fn(),
      onResult: vi.fn(),
      onStart: vi.fn(),
    };
    const session = createSpeechRecognitionSession({
      audioTrack: {} as MediaStreamTrack,
      callbacks,
      language: 'en-US',
      processLocally: false,
    });
    const recognition = instances[0]!;

    recognition.onstart?.();
    recognition.onaudiostart?.();
    recognition.onerror?.({ error: 'no-speech' });
    recognition.onresult?.({
      resultIndex: 0,
      results: {
        0: { 0: { confidence: Number.NaN, transcript: 'first' }, isFinal: false, length: 1 },
        1: { isFinal: true, length: 0 },
        2: { 0: { confidence: 0.8, transcript: 'final' }, isFinal: true, length: 1 },
        length: 3,
      },
    });
    recognition.onend?.();
    session.abort();

    expect(callbacks.onStart).toHaveBeenCalledOnce();
    expect(callbacks.onAudioStart).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith('no-speech');
    expect(callbacks.onResult).toHaveBeenNthCalledWith(1, {
      confidence: null,
      isFinal: false,
      text: 'first',
    });
    expect(callbacks.onResult).toHaveBeenNthCalledWith(2, {
      confidence: 0.8,
      isFinal: true,
      text: 'final',
    });
    expect(callbacks.onEnd).toHaveBeenCalledOnce();
    expect(recognition.abort).toHaveBeenCalledOnce();
  });

  it('rejects session creation when no recognition constructor exists', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    expect(() =>
      createSpeechRecognitionSession({
        audioTrack: {} as MediaStreamTrack,
        callbacks: {
          onAudioStart: vi.fn(),
          onEnd: vi.fn(),
          onError: vi.fn(),
          onResult: vi.fn(),
          onStart: vi.fn(),
        },
        language: 'ru-RU',
        processLocally: false,
      })
    ).toThrow('speech-recognition:unsupported');
  });

  it('treats a legacy instance as browser-managed only', () => {
    class LegacyRecognition {
      abort() {}
      continuous = true;
      interimResults = false;
      lang = '';
      maxAlternatives = 0;
      onaudiostart = null;
      onend = null;
      onerror = null;
      onresult = null;
      onstart = null;
      start() {}
      stop() {}
    }
    vi.stubGlobal('SpeechRecognition', LegacyRecognition);
    const callbacks = {
      onAudioStart: vi.fn(),
      onEnd: vi.fn(),
      onError: vi.fn(),
      onResult: vi.fn(),
      onStart: vi.fn(),
    };

    expect(() =>
      createSpeechRecognitionSession({
        audioTrack: {} as MediaStreamTrack,
        callbacks,
        language: 'ru-RU',
        processLocally: true,
      })
    ).toThrow('speech-recognition:local-unsupported');
    expect(
      createSpeechRecognitionSession({
        audioTrack: {} as MediaStreamTrack,
        callbacks,
        language: 'ru-RU',
        processLocally: false,
      }).legacyBrowserManaged
    ).toBe(true);
  });
});
