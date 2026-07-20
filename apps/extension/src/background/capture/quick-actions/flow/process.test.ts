import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../../../contracts/settings';

const { loadQuickActionRuntimeContextMock, runCaptureFlowMock, runSelectionFlowMock } = vi.hoisted(
  () => ({
    loadQuickActionRuntimeContextMock: vi.fn(),
    runCaptureFlowMock: vi.fn(),
    runSelectionFlowMock: vi.fn(),
  })
);

vi.mock('./load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./load')>()),
  loadQuickActionRuntimeContext: loadQuickActionRuntimeContextMock,
}));

vi.mock('./flows', () => ({
  runCaptureFlow: runCaptureFlowMock,
  runSelectionFlow: runSelectionFlowMock,
}));

import { processQuickAction } from './process';

function createSettings(): Settings {
  return {
    captureAction: 'download_default' as const,
    contextMenu: {
      enabled: true,
      showScreenshots: true,
      showVideo: true,
      showExport: true,
      showImageEditor: true,
      showVideoEditor: true,
      showGallery: true,
      showPageLinkCopy: true,
      showSettings: true,
    },
    saveCapturesToGallery: false,
    defaultViewportId: 'native',
    imageFormat: 'png',
    imageQuality: 90,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    viewportPresets: [],
  };
}

function createQuickAction(
  overrides: Partial<{
    id: string;
    screenshotMode: 'visible' | 'full' | 'selection';
    afterCapture: 'download_default' | 'ask_preset' | 'ask_system' | 'scenario' | 'edit' | 'copy';
    exitAfterCapture: boolean;
  }> = {}
) {
  return {
    id: 'action-1',
    status: true,
    name: 'Action 1',
    icon: 'camera',
    screenshotMode: 'visible' as const,
    exitAfterCapture: false,
    ...overrides,
  };
}

function createRuntimeContext(captureMode: 'visible' | 'selection' = 'visible') {
  return {
    action: createQuickAction({
      id: captureMode === 'selection' ? 'selection-action' : 'action-1',
      screenshotMode: captureMode,
      afterCapture: captureMode === 'selection' ? 'copy' : 'download_default',
      exitAfterCapture: captureMode === 'selection',
    }),
    afterCapture: captureMode === 'selection' ? 'copy' : 'download_default',
    captureMode,
    delaySeconds: captureMode === 'selection' ? 1 : 0,
    emulation: 'native',
    imageFormat: captureMode === 'selection' ? 'jpeg' : 'png',
    imageQuality: captureMode === 'selection' ? 75 : 90,
    settings: createSettings(),
  };
}

function createProcessArgs() {
  return {
    actionId: 'action-1',
    tabId: 19,
    viewportState: new Map<number, { width: number; height: number } | null>(),
    screenshotModeState: new Map<number, boolean>(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadQuickActionRuntimeContextMock.mockResolvedValue(createRuntimeContext());
});

describe('processQuickAction', () => {
  it('routes selection quick actions through the selection flow', async () => {
    loadQuickActionRuntimeContextMock.mockResolvedValueOnce(createRuntimeContext('selection'));

    const args = createProcessArgs();
    args.actionId = 'selection-action';
    args.tabId = 17;

    await processQuickAction(args);

    expect(runSelectionFlowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 17,
        afterCapture: 'copy',
        captureMode: 'selection',
      })
    );
    expect(runCaptureFlowMock).not.toHaveBeenCalled();
  });

  it('routes visible quick actions through the capture flow', async () => {
    await processQuickAction(createProcessArgs());

    expect(runCaptureFlowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 19,
        captureMode: 'visible',
      })
    );
    expect(runSelectionFlowMock).not.toHaveBeenCalled();
  });
});
