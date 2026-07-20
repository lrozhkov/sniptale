import { beforeEach, expect, it, vi } from 'vitest';
import type { applyEditorSelectionSettings } from '../../public-actions';
import type { previewEditorSelectionSettings } from '../../public-actions/selection/objects/settings';
import {
  type EditorSelectionApplyController,
  type EditorSelectionPreviewController,
  applyEditorSelectionSettingsViaController,
  previewEditorSelectionSettingsViaController,
} from './selection';

const mocks = vi.hoisted(() => ({
  applySelectionSettings: vi.fn<typeof applyEditorSelectionSettings>(),
  previewSelectionSettings: vi.fn<typeof previewEditorSelectionSettings>(),
}));

vi.mock('../../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-actions')>()),
  applyEditorSelectionSettings: mocks.applySelectionSettings,
}));

vi.mock('../../public-actions/selection/objects/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-actions/selection/objects/settings')>()),
  previewEditorSelectionSettings: mocks.previewSelectionSettings,
}));

function createApplyController(): EditorSelectionApplyController {
  return {
    canvas: null,
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: vi.fn((callback) => callback()),
  };
}

function createPreviewController(): EditorSelectionPreviewController {
  return {
    canvas: null,
    syncRuntimeState: vi.fn(),
    withHistoryMuted: vi.fn((callback) => callback()),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('bridges apply and preview selection setting callbacks through controller authority', () => {
  const applyController = createApplyController();
  const previewController = createPreviewController();

  applyEditorSelectionSettingsViaController(applyController);
  previewEditorSelectionSettingsViaController(previewController);

  const applyArgs = mocks.applySelectionSettings.mock.calls[0]?.[0];
  if (!applyArgs) {
    throw new Error('Expected apply selection settings args');
  }
  expect(applyArgs.canvas).toBeNull();
  applyArgs.withHistoryMuted(() => undefined);
  applyArgs.commitHistory();
  applyArgs.syncRuntimeState();
  const previewArgs = mocks.previewSelectionSettings.mock.calls[0]?.[0];
  if (!previewArgs) {
    throw new Error('Expected preview selection settings args');
  }
  expect(previewArgs.canvas).toBeNull();
  previewArgs.withHistoryMuted(() => undefined);
  previewArgs.syncRuntimeState();

  expect(applyController.withHistoryMuted).toHaveBeenCalledOnce();
  expect(applyController.commitHistory).toHaveBeenCalledOnce();
  expect(applyController.syncRuntimeState).toHaveBeenCalledOnce();
  expect(previewController.withHistoryMuted).toHaveBeenCalledOnce();
  expect(previewController.syncRuntimeState).toHaveBeenCalledOnce();
});
