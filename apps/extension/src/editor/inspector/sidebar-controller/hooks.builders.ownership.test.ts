import { expect, it, vi } from 'vitest';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

const saveEditorRenderedImageMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../document/file-actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../document/file-actions')>();

  return {
    ...actual,
    saveEditorRenderedImage: saveEditorRenderedImageMock,
  };
});

type ActionsHelpersModule = typeof import('./actions.helpers');

function createSelectionTargetArgs() {
  return {
    activeTool: 'select' as const,
    selection: { hasSelection: true, selectedObjectType: 'rectangle' as const },
    updateArrowSettings: vi.fn(),
    updateBlurSettings: vi.fn(),
    updateBrushSettings: vi.fn(),
    updateSelectionArrowSettings: vi.fn(),
    updateSelectionBlurSettings: vi.fn(),
    updateSelectionBrushSettings: vi.fn(),
    updateSelectionShapeSettings: vi.fn(),
    updateSelectionStepSettings: vi.fn(),
    updateSelectionTextSettings: vi.fn(),
    updateShapeSettings: vi.fn(),
    updateStepSettings: vi.fn(),
    updateTextSettings: vi.fn(),
  };
}

function exerciseSelectionTargets(
  helpers: Pick<ActionsHelpersModule, 'resolveToolSettingTargets'>,
  targetArgs: ReturnType<typeof createSelectionTargetArgs>
) {
  const targets = helpers.resolveToolSettingTargets(targetArgs as never);
  targets.arrow({ color: '#111111' });
  targets.brush('pencil', { color: '#222222' });
  targets.shape({ strokeColor: '#333333' });
  targets.step({ color: '#444444' });
  targets.text({ fontSize: 18 } as never);
  return targets;
}

function expectSelectionTargets(targetArgs: ReturnType<typeof createSelectionTargetArgs>) {
  expect(targetArgs.updateSelectionArrowSettings).toHaveBeenCalledOnce();
  expect(targetArgs.updateSelectionBrushSettings).toHaveBeenCalledOnce();
  expect(targetArgs.updateSelectionShapeSettings).toHaveBeenCalledWith('rectangle', {
    strokeColor: '#333333',
  });
  expect(targetArgs.updateSelectionStepSettings).toHaveBeenCalledOnce();
  expect(targetArgs.updateSelectionTextSettings).toHaveBeenCalledOnce();
}

function createUtilityActionArgs(
  targets: ReturnType<ActionsHelpersModule['resolveToolSettingTargets']>,
  setFrameDraft: ReturnType<typeof vi.fn>,
  rememberRecentColor: ReturnType<typeof vi.fn>
) {
  return {
    borderPresets: [DEFAULT_BORDER_PRESET],
    controller: {
      exportDocument: vi.fn(),
      previewActiveSettingsOnSelection: vi.fn(),
      refreshActiveToolSettingsPreview: vi.fn(),
      renderToDataUrl: vi.fn(() => 'data:image/png;base64,rendered'),
      withHistoryMuted<T>(callback: () => T) {
        return callback();
      },
    },
    confirmOpenStorageManager: vi.fn(async () => false),
    defaultImagePresetId: 'preset-default',
    hasImage: true,
    rememberRecentColor,
    savePresets: createInspectorCommandParams().savePresets,
    setFrameDraft,
    syncBrowserFrame: vi.fn(async () => undefined),
    targets,
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
  } as never;
}

async function exerciseUtilityActions(
  helpers: Pick<ActionsHelpersModule, 'buildSidebarUtilityActions'>,
  targets: ReturnType<ActionsHelpersModule['resolveToolSettingTargets']>
) {
  const setFrameDraft = vi.fn((updater) => updater(DEFAULT_EDITOR_FRAME_SETTINGS)) as never;
  const rememberRecentColor = vi.fn(async () => undefined);
  const utilityActions = helpers.buildSidebarUtilityActions(
    createUtilityActionArgs(targets, setFrameDraft, rememberRecentColor)
  );

  utilityActions.applyPreset(DEFAULT_BORDER_PRESET.id);
  utilityActions.setUniformPadding(24);
  utilityActions.updateColor(() => undefined, '#123456');
  utilityActions.updateColor(() => undefined, 'transparent');
  utilityActions.syncBrowserFrame({ enabled: true });
  await utilityActions.onSaveImage();
  await utilityActions.onSaveImageAs();
  await utilityActions.saveToPreset('preset-default');
  return { rememberRecentColor, setFrameDraft };
}

it('resolves tool targets and utility actions without a global singleton', async () => {
  const helpers = await import('./actions.helpers');
  const targetArgs = createSelectionTargetArgs();
  const targets = exerciseSelectionTargets(helpers, targetArgs);

  expectSelectionTargets(targetArgs);
  expect(helpers.buildBorderPresetOptions([DEFAULT_BORDER_PRESET])).toEqual([
    { label: DEFAULT_BORDER_PRESET.name, value: DEFAULT_BORDER_PRESET.id },
  ]);

  const staticOptions = helpers.createStaticSidebarOptions();
  expect(staticOptions.arrowVariantOptions).toHaveLength(2);
  expect(staticOptions.arrowHeadOptions).toHaveLength(10);
  expect(staticOptions.workspaceBackgroundPalette.length).toBeGreaterThan(0);

  const { rememberRecentColor, setFrameDraft } = await exerciseUtilityActions(helpers, targets);
  expect(rememberRecentColor).toHaveBeenCalledOnce();
  expect(rememberRecentColor).toHaveBeenCalledWith('#123456');
  expect(saveEditorRenderedImageMock).toHaveBeenCalledTimes(3);
  expect(setFrameDraft).toHaveBeenCalled();
});
