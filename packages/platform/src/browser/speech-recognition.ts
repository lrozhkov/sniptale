import type {
  VoiceInputApiFlavor,
  VoiceInputLanguage,
  VoiceInputLocalAvailability,
} from '@sniptale/runtime-contracts/voice-input';
import { VOICE_INPUT_LOCAL_QUALITY } from '@sniptale/runtime-contracts/voice-input';

type SpeechRecognitionOptions = {
  langs: VoiceInputLanguage[];
  processLocally: boolean;
  quality?: typeof VOICE_INPUT_LOCAL_QUALITY;
};

type SpeechRecognitionAlternativeLike = {
  confidence: number;
  transcript: string;
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionResultEventLike = Event & {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  readonly error: string;
};

export type SpeechRecognitionResult = {
  confidence: number | null;
  isFinal: boolean;
  text: string;
};

export type SpeechRecognitionSessionCallbacks = {
  onAudioStart: () => void;
  onEnd: () => void;
  onError: (errorCode: string) => void;
  onResult: (result: SpeechRecognitionResult) => void;
  onStart: () => void;
};

type SpeechRecognitionLike = {
  abort(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudiostart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onstart: ((event: Event) => void) | null;
  processLocally?: boolean;
  start(audioTrack?: MediaStreamTrack): void;
  stop(): void;
};

type SpeechRecognitionConstructorLike = {
  new (): SpeechRecognitionLike;
  available?: (options: SpeechRecognitionOptions) => Promise<string>;
  install?: (options: SpeechRecognitionOptions) => Promise<boolean>;
};

type SpeechRecognitionGlobal = typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

type SpeechRecognitionApi = {
  constructor: SpeechRecognitionConstructorLike | null;
  flavor: VoiceInputApiFlavor;
  qualitySupported: boolean;
};

class SpeechRecognitionPlatformError extends Error {
  constructor(readonly reason: 'local-unsupported' | 'unsupported' | 'unexpected') {
    super(`speech-recognition:${reason}`);
    this.name = 'SpeechRecognitionPlatformError';
  }
}

function resolveChromiumMajorVersion(userAgent: string): number | null {
  const match = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function isSpeechRecognitionDictationQualitySupported(
  userAgent = globalThis.navigator?.userAgent ?? ''
): boolean {
  const majorVersion = resolveChromiumMajorVersion(userAgent);
  return majorVersion !== null && majorVersion >= 150;
}

export function resolveSpeechRecognitionApi(): SpeechRecognitionApi {
  const speechGlobal = globalThis as SpeechRecognitionGlobal;
  const standard = speechGlobal.SpeechRecognition;
  const prefixed = speechGlobal.webkitSpeechRecognition;
  return {
    constructor: standard ?? prefixed ?? null,
    flavor: standard ? 'standard' : prefixed ? 'prefixed' : 'unsupported',
    qualitySupported: isSpeechRecognitionDictationQualitySupported(),
  };
}

function createOptions(args: {
  language: VoiceInputLanguage;
  processLocally: boolean;
  qualitySupported: boolean;
}): SpeechRecognitionOptions {
  return {
    langs: [args.language],
    processLocally: args.processLocally,
    ...(args.processLocally && args.qualitySupported ? { quality: VOICE_INPUT_LOCAL_QUALITY } : {}),
  };
}

function normalizeAvailability(value: unknown): VoiceInputLocalAvailability {
  return value === 'available' ||
    value === 'downloadable' ||
    value === 'downloading' ||
    value === 'unavailable'
    ? value
    : 'unknown';
}

export async function loadSpeechRecognitionAvailability(args: {
  language: VoiceInputLanguage;
  processLocally: boolean;
}): Promise<{
  apiFlavor: VoiceInputApiFlavor;
  availability: VoiceInputLocalAvailability;
  qualitySupported: boolean;
}> {
  const api = resolveSpeechRecognitionApi();
  if (!api.constructor) {
    return {
      apiFlavor: api.flavor,
      availability: 'unsupported',
      qualitySupported: api.qualitySupported,
    };
  }
  if (args.processLocally && !api.qualitySupported) {
    return {
      apiFlavor: api.flavor,
      availability: 'unsupported',
      qualitySupported: false,
    };
  }
  if (!api.constructor.available) {
    return {
      apiFlavor: api.flavor,
      availability: args.processLocally ? 'unsupported' : 'unknown',
      qualitySupported: api.qualitySupported,
    };
  }
  const availability = await api.constructor.available(
    createOptions({ ...args, qualitySupported: api.qualitySupported })
  );
  return {
    apiFlavor: api.flavor,
    availability: normalizeAvailability(availability),
    qualitySupported: api.qualitySupported,
  };
}

export async function installSpeechRecognitionLanguage(
  language: VoiceInputLanguage
): Promise<boolean> {
  const api = resolveSpeechRecognitionApi();
  if (!api.qualitySupported || !api.constructor?.install) {
    throw new SpeechRecognitionPlatformError('local-unsupported');
  }
  try {
    return await api.constructor.install(
      createOptions({ language, processLocally: true, qualitySupported: api.qualitySupported })
    );
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new SpeechRecognitionPlatformError('unexpected');
  }
}

function emitRecognitionResults(
  event: SpeechRecognitionResultEventLike,
  callback: SpeechRecognitionSessionCallbacks['onResult']
): void {
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const alternative = result?.[0];
    if (!result || !alternative) continue;
    callback({
      confidence: Number.isFinite(alternative.confidence) ? alternative.confidence : null,
      isFinal: result.isFinal,
      text: alternative.transcript,
    });
  }
}

export function createSpeechRecognitionSession(args: {
  audioTrack: MediaStreamTrack;
  callbacks: SpeechRecognitionSessionCallbacks;
  language: VoiceInputLanguage;
  processLocally: boolean;
}): {
  abort(): void;
  dispose(): void;
  flavor: VoiceInputApiFlavor;
  legacyBrowserManaged: boolean;
  start(): void;
  stop(): void;
} {
  const api = resolveSpeechRecognitionApi();
  if (!api.constructor) throw new SpeechRecognitionPlatformError('unsupported');
  if (args.processLocally && !api.qualitySupported) {
    throw new SpeechRecognitionPlatformError('local-unsupported');
  }
  const recognition = new api.constructor();
  if (args.processLocally && !('processLocally' in recognition)) {
    throw new SpeechRecognitionPlatformError('local-unsupported');
  }
  recognition.lang = args.language;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  if ('processLocally' in recognition) recognition.processLocally = args.processLocally;
  recognition.onaudiostart = () => args.callbacks.onAudioStart();
  recognition.onstart = () => args.callbacks.onStart();
  recognition.onend = () => args.callbacks.onEnd();
  recognition.onerror = (event) => args.callbacks.onError(event.error);
  recognition.onresult = (event) => emitRecognitionResults(event, args.callbacks.onResult);

  const dispose = () => {
    recognition.onaudiostart = null;
    recognition.onstart = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
  };

  return {
    abort: () => recognition.abort(),
    dispose,
    flavor: api.flavor,
    legacyBrowserManaged: !args.processLocally && !('processLocally' in recognition),
    start: () => recognition.start(args.audioTrack),
    stop: () => recognition.stop(),
  };
}
