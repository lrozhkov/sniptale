/* eslint-disable max-lines-per-function --
   action-result proof keeps merged action contract and error surfacing together */
import { describe, expect, it, vi } from 'vitest';

const helperMocks = vi.hoisted(() => ({
  buildBorderPresetOptions: vi.fn(() => [{ label: 'Border', value: 'border-1' }]),
  buildSidebarUtilityActions: vi.fn(() => ({ utilityAction: 'ok' })),
  createStaticSidebarOptions: vi.fn(() => ({ staticOption: true })),
}));

const workspaceActionMocks = vi.hoisted(() => ({
  createWorkspaceColorActionForSidebar: vi.fn(() => 'workspace-color-action'),
  createWorkspaceDefaultSaveActionForSidebar: vi.fn(() => 'workspace-default-action'),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('./actions.helpers', () => helperMocks);
vi.mock('./workspace-color-action', () => workspaceActionMocks);

import { createSidebarActionResult } from './action-result';

function createArgs() {
  return {
    borderPresets: [{ id: 'border-1', name: 'Border', enabled: true }],
    controller: {
      applyFrameSettings: vi.fn(),
      copyRenderedImage: vi.fn(async () => undefined),
    },
    hasImage: true,
    recentColors: ['#111111'],
    rememberRecentColor: vi.fn(async () => undefined),
    saveShapeAsHighlighterPreset: vi.fn(async () => undefined),
    selectionPatchActions: { applyTextPatch: vi.fn() },
    insertOrUpdateBrowserFrame: vi.fn(async () => undefined),
    sidebarArgs: {
      browserFrame: { enabled: true },
      confirmOpenStorageManager: vi.fn(),
      defaultImagePresetId: 'preset-default',
      frameDraft: { backgroundColor: '#ffffff' },
      savePresets: [],
      setFrameDraft: vi.fn(),
    },
    syncBrowserFrame: vi.fn(async () => undefined),
    utilityTargets: {
      arrow: vi.fn(),
      brush: vi.fn(),
      preset: vi.fn(),
      shape: vi.fn(),
      step: vi.fn(),
      text: vi.fn(),
    },
  };
}

describe('createSidebarActionResult', () => {
  it('merges utility actions and wires copy/apply handlers', async () => {
    const args = createArgs();
    const result = createSidebarActionResult({
      ...args,
      defaultBorderPresetId: 'border-1',
    } as never);

    result.onApplyFrame();
    await result.onCopyRenderedImage({ outputSize: { width: 200, height: 100 } });

    expect(args.controller.applyFrameSettings).toHaveBeenCalledWith(args.sidebarArgs.frameDraft);
    expect(args.controller.copyRenderedImage).toHaveBeenCalledWith({
      outputSize: { width: 200, height: 100 },
    });
    expect(helperMocks.buildBorderPresetOptions).toHaveBeenCalledWith(args.borderPresets);
    expect(helperMocks.buildSidebarUtilityActions).toHaveBeenCalledWith(
      expect.objectContaining({
        borderPresets: args.borderPresets,
        controller: args.controller,
        insertOrUpdateBrowserFrame: args.insertOrUpdateBrowserFrame,
        rememberRecentColor: args.rememberRecentColor,
        syncBrowserFrame: args.syncBrowserFrame,
        targets: args.utilityTargets,
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        applyWorkspaceColor: 'workspace-color-action',
        borderPresetOptions: [{ label: 'Border', value: 'border-1' }],
        defaultBorderPresetId: 'border-1',
        insertOrUpdateBrowserFrame: args.insertOrUpdateBrowserFrame,
        recentColors: ['#111111'],
        saveShapeAsHighlighterPreset: args.saveShapeAsHighlighterPreset,
        saveWorkspaceColorAsDefault: 'workspace-default-action',
        staticOption: true,
        utilityAction: 'ok',
      })
    );
  });

  it('skips copy without an image and surfaces wrapped errors on copy failure', async () => {
    const withoutImage = createArgs();
    withoutImage.hasImage = false;
    const withoutImageResult = createSidebarActionResult({
      ...withoutImage,
      defaultBorderPresetId: 'border-1',
    } as never);

    await withoutImageResult.onCopyRenderedImage();
    expect(withoutImage.controller.copyRenderedImage).not.toHaveBeenCalled();

    const withFailure = createArgs();
    const failure = new Error('clipboard');
    withFailure.controller.copyRenderedImage = vi.fn(async () => {
      throw failure;
    });
    const result = createSidebarActionResult({
      ...withFailure,
      defaultBorderPresetId: 'border-1',
    } as never);

    await expect(result.onCopyRenderedImage()).rejects.toMatchObject({
      message: 'editor.runtime.copyImageFailed',
      cause: failure,
    });
    expect(toastErrorMock).toHaveBeenCalledWith('editor.runtime.copyImageFailed');
  });
});
