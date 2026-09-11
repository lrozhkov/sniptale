import { describe, expect, it, vi } from 'vitest';
import { buildScenarioControllerViewState } from './view-state';

function createManualCapturePayload() {
  return {
    captureSurface: 'visible' as const,
    page: {
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      title: 'Page',
      url: 'https://example.com',
      viewport: { height: 800, width: 1200, x: 0, y: 0 },
    },
    sourceKind: 'manual' as const,
  };
}

describe('scenario-view-props-state', () => {
  it('maps the effective session and manual payload builder into the controller view state', async () => {
    const buildCapturePayload = vi.fn(createManualCapturePayload);
    const refreshSession = vi.fn(async () => undefined);
    const saveSelectionCapture = vi.fn(async () => undefined);

    const viewState = buildScenarioControllerViewState({
      buildCapturePayload,
      captureAction: 'download_default',
      effectiveSession: {
        captureMode: 'manual',
        enabled: true,
        pendingProjectSelection: false,
        projectId: 'project-1',
        projectName: 'Project 1',
        rememberProjectSelection: true,
        sidebarVisible: true,
      },
      projects: [
        {
          availability: 'available' as const,
          createdAt: 1,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: 1,
        },
      ],
      recentStepHighlightToken: 3,
      recentSteps: [
        {
          id: 'step-1',
          position: 0,
          stepNumber: 1,
          previewDataUrl: 'data:image/png;base64,1',
          title: 'Step 1',
        },
      ],
      refreshSession,
      saveSelectionCapture,
      sidebarVisible: true,
    });

    expect(viewState.buildManualCapturePayload('visible')).toEqual(createManualCapturePayload());
    expect(buildCapturePayload).toHaveBeenCalledWith('visible', 'manual');
    expect(viewState.refreshSession).toBe(refreshSession);
    expect(viewState.saveSelectionCapture).toBe(saveSelectionCapture);
    expect(viewState.scenarioProjectId).toBe('project-1');
    expect(viewState.recentStepHighlightToken).toBe(3);
  });
});
