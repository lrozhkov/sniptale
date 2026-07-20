import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  initTracerMock,
  initializeBackgroundRuntimeMock,
  registerBackgroundRuntimeMessageListenerMock,
  scenarioSessionServiceCtorMock,
} = vi.hoisted(() => ({
  initTracerMock: vi.fn(),
  initializeBackgroundRuntimeMock: vi.fn(),
  registerBackgroundRuntimeMessageListenerMock: vi.fn(),
  scenarioSessionServiceCtorMock: vi.fn(function ScenarioSessionServiceMock(this: {
    kind: string;
  }) {
    this.kind = 'scenario-session-service';
  }),
}));

vi.mock('@sniptale/platform/observability/message-tracer', () => ({
  initTracer: initTracerMock,
}));

vi.mock('../routing/boundary/listener', () => ({
  registerBackgroundRuntimeMessageListener: registerBackgroundRuntimeMessageListenerMock,
}));

vi.mock('../routing/runtime-wiring/initialize', () => ({
  initializeBackgroundRuntime: initializeBackgroundRuntimeMock,
}));

vi.mock('../../scenario/session-service', () => ({
  ScenarioSessionService: scenarioSessionServiceCtorMock,
}));

describe('background/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('boots the background runtime and message listener with shared mode state maps', async () => {
    await import('../..');

    expect(initTracerMock).toHaveBeenCalledWith('bg');
    expect(initializeBackgroundRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        captureGuardState: { isCapturing: false },
        highlighterModeState: expect.any(Map),
        quickEditModeState: expect.any(Map),
        scenarioSessionService: { kind: 'scenario-session-service' },
        screenshotModeState: expect.any(Map),
        viewportState: expect.any(Map),
      })
    );
    expect(registerBackgroundRuntimeMessageListenerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        captureGuardState: { isCapturing: false },
        highlighterModeState: expect.any(Map),
        quickEditModeState: expect.any(Map),
        scenarioSessionService: { kind: 'scenario-session-service' },
        screenshotModeState: expect.any(Map),
        viewportState: expect.any(Map),
      })
    );
  });
});
