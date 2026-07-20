import { beforeEach, expect, it, vi } from 'vitest';

const { saveScenarioCaptureStepMock } = vi.hoisted(() => ({
  saveScenarioCaptureStepMock: vi.fn(),
}));

vi.mock('../../../content/overlay/scenario/runtime/transport/steps', () => ({
  deleteScenarioStep: vi.fn(),
  moveScenarioStep: vi.fn(),
  restoreScenarioStep: vi.fn(),
  saveScenarioCaptureStep: saveScenarioCaptureStepMock,
}));

import type { ScreenshotCaptureAdapter } from './types';
import { createPreparationScenarioAutoClickCaptureTransport } from './scenario-capture';

function createPayload() {
  return {
    captureSurface: 'visible' as const,
    sourceKind: 'auto-click' as const,
    page: {
      title: 'Snapshot',
      url: 'https://source.example',
      viewport: { x: 0, y: 0, width: 800, height: 600 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('captures auto-click scenario steps through the viewer capture adapter', async () => {
  const captureAdapter: ScreenshotCaptureAdapter = {
    captureSelection: vi.fn(),
    captureViewport: vi.fn().mockResolvedValue('data:image/png;base64,viewer'),
  };
  saveScenarioCaptureStepMock.mockResolvedValue({ success: true });

  const response =
    await createPreparationScenarioAutoClickCaptureTransport(captureAdapter)(createPayload());

  expect(response).toEqual({ success: true, dataUrl: 'data:image/png;base64,viewer' });
  expect(captureAdapter.captureViewport).toHaveBeenCalledWith('visible');
  expect(saveScenarioCaptureStepMock).toHaveBeenCalledWith(
    expect.objectContaining({
      dataUrl: 'data:image/png;base64,viewer',
      scenarioCapture: createPayload(),
    })
  );
});
