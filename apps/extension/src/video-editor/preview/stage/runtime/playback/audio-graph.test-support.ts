import { vi } from 'vitest';

class FakePreviewAudioParam {
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
  });
  linearRampToValueAtTime = vi.fn((value: number) => {
    this.value = value;
  });

  constructor(public value = 0) {}
}

class FakePreviewGainNode {
  connect = vi.fn();
  disconnect = vi.fn();
  gain = new FakePreviewAudioParam();

  constructor(public context: FakePreviewAudioContext) {}
}

class FakePreviewMediaElementSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();

  constructor(public readonly element: HTMLAudioElement) {}
}

class FakePreviewAudioContext {
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createGain = vi.fn(() => {
    const gain = new FakePreviewGainNode(this);
    this.gains.push(gain);
    return gain;
  });
  createMediaElementSource = vi.fn((element: HTMLAudioElement) => {
    const source = new FakePreviewMediaElementSourceNode(element);
    this.sources.push(source);
    return source;
  });
  currentTime = 12;
  destination = {};
  gains: FakePreviewGainNode[] = [];
  resume = vi.fn(async () => {
    if (this.resumeError) {
      throw this.resumeError;
    }
    this.state = 'running';
  });
  sources: FakePreviewMediaElementSourceNode[] = [];
  state: AudioContextState;

  constructor(
    readonly options: AudioContextOptions | undefined,
    private readonly resumeError: Error | null,
    state: AudioContextState
  ) {
    this.state = state;
  }
}

class FakePreviewAudioContextHarness {
  audioContexts: FakePreviewAudioContext[] = [];
  constructorMock: ReturnType<typeof vi.fn>;

  constructor(config: { resumeError?: Error; state?: AudioContextState } = {}) {
    const audioContexts = this.audioContexts;
    const resumeError = config.resumeError ?? null;
    const state = config.state ?? 'running';
    this.constructorMock = vi.fn(function MockAudioContext(options?: AudioContextOptions) {
      const context = new FakePreviewAudioContext(options, resumeError, state);
      audioContexts.push(context);
      return context;
    });
  }

  get latestContext(): FakePreviewAudioContext {
    const context = this.audioContexts.at(-1);
    if (!context) {
      throw new Error('Preview audio context was not created');
    }
    return context;
  }

  install(): this {
    vi.stubGlobal('AudioContext', this.constructorMock as unknown as typeof AudioContext);
    return this;
  }
}

export async function flushPreviewAudioGraphTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function installPreviewAudioContextHarness(config?: {
  resumeError?: Error;
  state?: AudioContextState;
}): FakePreviewAudioContextHarness {
  return new FakePreviewAudioContextHarness(config).install();
}
