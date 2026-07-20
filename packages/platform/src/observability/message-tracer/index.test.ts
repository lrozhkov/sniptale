import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TraceConfig } from './types';

type TestTransport = {
  clearQueue: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  flushQueue: ReturnType<typeof vi.fn>;
  getQueueSize: ReturnType<typeof vi.fn>;
  isConnected: ReturnType<typeof vi.fn>;
  sendEvent: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  createTraceTransportMock: vi.fn(),
  installActiveTraceObserverMock: vi.fn(),
  sanitizeTraceErrorTextMock: vi.fn(),
  sanitizeValueMock: vi.fn(),
  safeStringifyMock: vi.fn(),
}));

vi.mock('./transport', async (importOriginal) => ({
  ...(await importOriginal()),
  createTraceTransport: mocks.createTraceTransportMock,
}));

vi.mock('./runtime', async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveTraceObserver: () => null,
  installActiveTraceObserver: mocks.installActiveTraceObserverMock,
}));

vi.mock('./utils', () => ({
  safeStringify: mocks.safeStringifyMock,
  sanitizeTraceErrorText: mocks.sanitizeTraceErrorTextMock,
  sanitizeValue: mocks.sanitizeValueMock,
}));

function createTransport(): TestTransport {
  return {
    clearQueue: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    flushQueue: vi.fn(),
    getQueueSize: vi.fn(() => 2),
    isConnected: vi.fn(() => true),
    sendEvent: vi.fn(),
  };
}

function setTraceFlag(value: boolean | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, '__TRACE_MESSAGES__');
    return;
  }

  Object.defineProperty(globalThis, '__TRACE_MESSAGES__', {
    configurable: true,
    value,
  });
}

function setChromeMock(withTabs: boolean) {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {},
      tabs: withTabs ? {} : undefined,
    },
  });
}

async function importTracerModule() {
  vi.resetModules();
  return import('./index');
}

async function importTraceTypesModule() {
  vi.resetModules();
  return import('./types');
}

function configureDefaultTracerMocks() {
  mocks.safeStringifyMock.mockImplementation((value: unknown) => JSON.stringify(value));
  mocks.sanitizeTraceErrorTextMock.mockImplementation((value: unknown) => String(value));
  mocks.sanitizeValueMock.mockImplementation((value: unknown) => ({ sanitized: value }));
  mocks.installActiveTraceObserverMock.mockReturnValue(vi.fn());
}

function resetTracerTestState() {
  vi.clearAllMocks();
  Reflect.deleteProperty(globalThis, 'chrome');
  setTraceFlag(undefined);
}

function expectTracerInitialization(transport: TestTransport) {
  expect(mocks.createTraceTransportMock).toHaveBeenCalledWith(
    expect.objectContaining<Partial<TraceConfig>>({ enabled: true, wsPort: 9333 }),
    'popup'
  );
  expect(transport.connect).toHaveBeenCalledTimes(1);
  expect(mocks.installActiveTraceObserverMock).toHaveBeenCalledTimes(1);
}

async function initializeTracerRuntime() {
  const transport = createTransport();
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  mocks.createTraceTransportMock.mockReturnValue(transport);
  setTraceFlag(true);
  setChromeMock(true);

  const tracer = await importTracerModule();
  tracer.initTracer('popup', { wsPort: 9333 });

  return { logSpy, tracer, transport };
}

beforeEach(() => {
  resetTracerTestState();
  configureDefaultTracerMocks();
});

describe('message-tracer initialization', () => {
  it('initializes tracer and installs runtime interceptors through transport', async () => {
    const { logSpy, tracer, transport } = await initializeTracerRuntime();

    expectTracerInitialization(transport);
    expect(logSpy).toHaveBeenCalledWith('[Tracer]', 'Initializing for context: popup');
    expect(logSpy).toHaveBeenCalledWith('[Tracer]', 'Initialized for popup');
    expect(typeof tracer.initTracer).toBe('function');
  });

  it('warns on repeated initialization without reinstalling the observer', async () => {
    const transport = createTransport();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.createTraceTransportMock.mockReturnValue(transport);
    setTraceFlag(true);

    const tracer = await importTracerModule();
    tracer.initTracer('editor');
    tracer.initTracer('bg');

    expect(mocks.installActiveTraceObserverMock).toHaveBeenCalledTimes(1);
    expect(mocks.createTraceTransportMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[Tracer]', 'Already initialized');
    expect(logSpy).toHaveBeenCalledWith('[Tracer]', 'Initializing for context: editor');
    expect(logSpy).toHaveBeenCalledWith('[Tracer]', 'Initialized for editor');
  });
});

describe('message-tracer disabled gates', () => {
  it('disables tracing entirely when the build flag is false', async () => {
    const transport = createTransport();
    mocks.createTraceTransportMock.mockReturnValue(transport);
    setTraceFlag(false);

    const tracer = await importTracerModule();
    tracer.initTracer('bg');

    expect(mocks.createTraceTransportMock).not.toHaveBeenCalled();
    expect(mocks.installActiveTraceObserverMock).not.toHaveBeenCalled();
  });

  it('fails closed when the build flag is absent', async () => {
    const transport = createTransport();
    mocks.createTraceTransportMock.mockReturnValue(transport);
    setTraceFlag(undefined);

    const tracer = await importTracerModule();
    tracer.initTracer('bg');

    expect(mocks.createTraceTransportMock).not.toHaveBeenCalled();
    expect(mocks.installActiveTraceObserverMock).not.toHaveBeenCalled();
  });

  it('allows explicit runtime config to disable tracing in a trace build', async () => {
    const transport = createTransport();
    mocks.createTraceTransportMock.mockReturnValue(transport);
    setTraceFlag(true);

    const tracer = await importTracerModule();
    tracer.initTracer('bg', { enabled: false });

    expect(mocks.createTraceTransportMock).not.toHaveBeenCalled();
    expect(mocks.installActiveTraceObserverMock).not.toHaveBeenCalled();
  });
});

describe('message-tracer default transport URL', () => {
  it('uses localhost when the trace URL define is absent', async () => {
    Reflect.deleteProperty(globalThis, '__SNIPTALE_TRACE_WS_URL__');

    const { DEFAULT_TRACE_CONFIG } = await importTraceTypesModule();

    expect(DEFAULT_TRACE_CONFIG.wsUrl).toBe('ws://localhost');
  });

  it('uses the trace URL define when it is present', async () => {
    Object.defineProperty(globalThis, '__SNIPTALE_TRACE_WS_URL__', {
      configurable: true,
      value: 'about:blank',
    });

    const { DEFAULT_TRACE_CONFIG } = await importTraceTypesModule();

    expect(DEFAULT_TRACE_CONFIG.wsUrl).toBe('about:blank');
  });
});
