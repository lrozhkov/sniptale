// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioRuntimeCapturePayload } from '../../../../contracts/messaging/contracts/types';
import type { ScenarioCaptureSurface } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureMetadata,
  ScenarioPoint,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import { DEFAULT_BORDER_PRESET } from '../../../../composition/persistence/highlighter';

const { saveScenarioCaptureStepMock } = vi.hoisted(() => ({
  saveScenarioCaptureStepMock: vi.fn(),
}));

const { showToastMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

vi.mock('../runtime/transport/steps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/transport/steps')>()),
  saveScenarioCaptureStep: saveScenarioCaptureStepMock,
}));

import { createScenarioCapturePayloadBuilder, createScenarioSelectionCaptureSaver } from './source';

function resetScenarioCaptureTestState() {
  vi.clearAllMocks();
  document.title = 'Capture page';
  window.history.replaceState({}, '', '/page');
  saveScenarioCaptureStepMock.mockResolvedValue({
    success: true,
    projectId: 'project-1',
    stepId: 'step-1',
  });
}

function createScenarioSession(enabled: boolean) {
  return {
    enabled,
    captureMode: 'manual' as const,
    pendingProjectSelection: false,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    sidebarVisible: true,
  };
}

function expectCapturePayloadBuilderBehavior() {
  const disabledBuilder = createScenarioCapturePayloadBuilder({
    screenshotMode: true,
    session: createScenarioSession(false),
  });

  expect(disabledBuilder('visible', 'manual')).toBeNull();

  const builder = createScenarioCapturePayloadBuilder({
    screenshotMode: true,
    session: createScenarioSession(true),
  });

  const target = document.createElement('button');
  target.textContent = 'Save';
  document.body.appendChild(target);

  expect(builder('visible', 'manual', target)).toEqual(
    expect.objectContaining({
      body: 'Capture page',
      captureSurface: 'visible',
      page: expect.objectContaining({
        title: 'Capture page',
        url: 'http://localhost:3000/page',
      }),
      sourceKind: 'manual',
      target: expect.objectContaining({
        framePadding: { ...DEFAULT_BORDER_PRESET.padding },
      }),
      title: 'Save',
    })
  );
}

function createScenarioSelectionPayload() {
  return {
    body: 'Body',
    captureSurface: 'visible' as const,
    cursorPoint: null,
    interactionPoint: null,
    page: {
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      title: 'Capture page',
      url: 'http://localhost:3000/page',
      viewport: { height: 720, width: 1280, x: 0, y: 0 },
    },
    sourceKind: 'manual' as const,
    target: null,
    title: 'Title',
  } satisfies ScenarioRuntimeCapturePayload;
}

async function expectSelectionCaptureSaveFlow() {
  const applyScenarioResponse = vi.fn();
  const saveSelectionCapture = createScenarioSelectionCaptureSaver({
    applyScenarioResponse,
    buildCapturePayload: vi.fn<
      (
        captureSurface: ScenarioCaptureSurface,
        sourceKind: 'manual' | 'auto-click',
        target?: HTMLElement | null,
        interactionPoint?: ScenarioPoint | null,
        cursorPoint?: ScenarioPoint | null,
        captureMetadata?: ScenarioCaptureMetadata
      ) => ScenarioRuntimeCapturePayload | null
    >(() => createScenarioSelectionPayload()),
  });

  await saveSelectionCapture('data:image/png;base64,1', 'visible');

  expect(saveScenarioCaptureStepMock).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,1',
    filename: expect.stringContaining('_visible.png'),
    scenarioCapture: expect.objectContaining({
      captureSurface: 'visible',
      sourceKind: 'manual',
    }),
  });
  expect(applyScenarioResponse).toHaveBeenCalledWith({
    success: true,
    projectId: 'project-1',
    stepId: 'step-1',
  });
}

async function expectSelectionCaptureSaveFailureSurfacesError() {
  const saveSelectionCapture = createScenarioSelectionCaptureSaver({
    applyScenarioResponse: vi.fn(),
    buildCapturePayload: vi.fn(() => createScenarioSelectionPayload()),
  });
  saveScenarioCaptureStepMock.mockResolvedValueOnce({
    success: false,
    error: 'save failed',
  });

  await expect(saveSelectionCapture('data:image/png;base64,1', 'visible')).rejects.toThrow(
    'save failed'
  );
  expect(showToastMock).toHaveBeenCalledWith('save failed', 'error');
}

async function expectStaleSelectionCaptureSkipsScenarioResponseApplication() {
  const applyScenarioResponse = vi.fn();
  const saveSelectionCapture = createScenarioSelectionCaptureSaver({
    applyScenarioResponse,
    buildCapturePayload: vi.fn(() => createScenarioSelectionPayload()),
  });

  await saveSelectionCapture('data:image/png;base64,1', 'visible', () => false);

  expect(saveScenarioCaptureStepMock).toHaveBeenCalledOnce();
  expect(applyScenarioResponse).not.toHaveBeenCalled();
  expect(showToastMock).not.toHaveBeenCalled();
}

describe('useScenarioController.capture', () => {
  beforeEach(resetScenarioCaptureTestState);

  it('builds capture payloads only for enabled screenshot sessions', () => {
    expectCapturePayloadBuilderBehavior();
  });

  it('saves selection captures through the scenario transport owner and preserves preview data', async () => {
    await expectSelectionCaptureSaveFlow();
  });

  it('surfaces unsuccessful scenario step saves instead of silently ignoring them', async () => {
    await expectSelectionCaptureSaveFailureSurfacesError();
  });

  it('skips applying scenario responses when screenshot ownership is stale', async () => {
    await expectStaleSelectionCaptureSkipsScenarioResponseApplication();
  });
});
