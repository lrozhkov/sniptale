export type ChromeAiAvailability =
  | 'available'
  | 'downloading'
  | 'downloadable'
  | 'unavailable'
  | 'unsupported';

type ChromeAiCapability = 'multimodal';
type ChromeAiRuntimeErrorReason = 'unexpected' | 'unsupported';

export class ChromeAiRuntimeError extends Error {
  readonly reason: ChromeAiRuntimeErrorReason;

  constructor(reason: ChromeAiRuntimeErrorReason) {
    super(`chrome-ai:${reason}`);
    this.name = 'ChromeAiRuntimeError';
    this.reason = reason;
  }
}

type ChromeAiOutputLanguageCode = 'en' | 'es' | 'ja';

type ChromeAiExpectedInputType = 'audio' | 'image' | 'text';

type ChromeAiExpectedInput = {
  languages?: string[];
  type: ChromeAiExpectedInputType;
};

type ChromeAiExpectedOutput = {
  languages?: string[];
  type: 'text';
};

type ChromeAiPromptPart =
  | { type: 'audio'; value: ArrayBuffer | ArrayBufferView | AudioBuffer | Blob }
  | {
      type: 'image';
      value:
        | Blob
        | HTMLCanvasElement
        | HTMLImageElement
        | HTMLVideoElement
        | ImageBitmap
        | ImageData
        | OffscreenCanvas
        | SVGImageElement
        | VideoFrame;
    }
  | { type: 'text'; value: string };

type ChromeAiPromptMessage = {
  content: string | ChromeAiPromptPart[];
  role: 'assistant' | 'system' | 'user';
};

type ChromeAiPromptOptions = {
  signal?: AbortSignal;
};

type ChromeAiSession = {
  append?: (messages: ChromeAiPromptMessage[]) => Promise<void>;
  destroy: () => void;
  prompt: (
    input: ChromeAiPromptMessage[] | string,
    options?: ChromeAiPromptOptions
  ) => Promise<string>;
};

type ChromeAiCreateMonitor = {
  addEventListener: (
    eventName: 'downloadprogress',
    listener: (event: { loaded: number }) => void
  ) => void;
};

type ChromeAiSessionOptions = {
  expectedInputs: ChromeAiExpectedInput[];
  expectedOutputs: ChromeAiExpectedOutput[];
  initialPrompts?: ChromeAiPromptMessage[];
  monitor?: (monitor: ChromeAiCreateMonitor) => void;
  signal?: AbortSignal;
};

type ChromeAiLanguageModel = {
  availability: (options: ChromeAiSessionOptions) => Promise<string>;
  create: (options: ChromeAiSessionOptions) => Promise<ChromeAiSession>;
  params?: () => Promise<{
    defaultTemperature: number;
    defaultTopK: number;
    maxTemperature: number;
    maxTopK: number;
  }>;
};

function getLanguageModel(): ChromeAiLanguageModel | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return (
    (globalThis as typeof globalThis & { LanguageModel?: ChromeAiLanguageModel }).LanguageModel ??
    null
  );
}

function createExpectedInputs(capability: ChromeAiCapability): ChromeAiExpectedInput[] {
  switch (capability) {
    case 'multimodal':
      return [{ type: 'text' }, { type: 'image' }];
  }
}

function resolveChromeAiOutputLanguage(): ChromeAiOutputLanguageCode {
  return 'en';
}

function createSessionOptions(args: {
  capability: ChromeAiCapability;
  initialPrompts?: ChromeAiPromptMessage[];
  monitor?: (monitor: ChromeAiCreateMonitor) => void;
  signal?: AbortSignal;
}): ChromeAiSessionOptions {
  const baseOptions: ChromeAiSessionOptions = {
    expectedInputs: createExpectedInputs(args.capability),
    expectedOutputs: [{ type: 'text', languages: [resolveChromeAiOutputLanguage()] }],
  };

  if (args.initialPrompts !== undefined) {
    baseOptions.initialPrompts = args.initialPrompts;
  }
  if (args.monitor !== undefined) {
    baseOptions.monitor = args.monitor;
  }
  if (args.signal !== undefined) {
    baseOptions.signal = args.signal;
  }

  return baseOptions;
}

function normalizeChromeAiError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new ChromeAiRuntimeError('unexpected');
}

export function createChromeAiSystemPromptMessage(systemPrompt: string): ChromeAiPromptMessage[] {
  const trimmedPrompt = systemPrompt.trim();
  return trimmedPrompt === '' ? [] : [{ role: 'system', content: trimmedPrompt }];
}

export async function loadChromeAiAvailability(
  capability: ChromeAiCapability = 'multimodal'
): Promise<ChromeAiAvailability> {
  const languageModel = getLanguageModel();

  if (languageModel === null) {
    return 'unsupported';
  }

  const availability = await languageModel.availability(createSessionOptions({ capability }));
  return availability === 'available' ||
    availability === 'downloadable' ||
    availability === 'downloading' ||
    availability === 'unavailable'
    ? availability
    : 'unsupported';
}

export async function prepareChromeAiSession(args: {
  capability?: ChromeAiCapability;
  onDownloadProgress?: (progress: number) => void;
}): Promise<void> {
  const languageModel = getLanguageModel();

  if (languageModel === null) {
    throw new ChromeAiRuntimeError('unsupported');
  }

  const session = await languageModel.create(
    createSessionOptions({
      capability: args.capability ?? 'multimodal',
      ...(args.onDownloadProgress === undefined
        ? {}
        : {
            monitor: (monitor) => {
              monitor.addEventListener('downloadprogress', (event) => {
                args.onDownloadProgress?.(event.loaded);
              });
            },
          }),
    })
  );

  session.destroy();
}

export async function createChromeAiSession(args: {
  capability?: ChromeAiCapability;
  initialPrompts?: ChromeAiPromptMessage[];
  signal?: AbortSignal;
}): Promise<ChromeAiSession> {
  const languageModel = getLanguageModel();

  if (languageModel === null) {
    throw new ChromeAiRuntimeError('unsupported');
  }

  try {
    return await languageModel.create(
      createSessionOptions({
        capability: args.capability ?? 'multimodal',
        ...(args.initialPrompts === undefined ? {} : { initialPrompts: args.initialPrompts }),
        ...(args.signal === undefined ? {} : { signal: args.signal }),
      })
    );
  } catch (error) {
    throw normalizeChromeAiError(error);
  }
}
