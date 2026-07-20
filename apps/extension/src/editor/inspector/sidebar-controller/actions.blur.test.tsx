// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  createControllerMock,
  renderWithControllerAsync,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

vi.mock('./actions.state', () => ({
  useBorderPresetsState: () => ({
    appendBorderPreset: vi.fn(),
    borderPresets: [DEFAULT_BORDER_PRESET],
  }),
  useRecentColorsState: () => ({
    recentColors: [],
    rememberRecentColor: vi.fn(async () => undefined),
  }),
}));

type BlurActions = {
  applyBlurPatch: (patch: { amount?: number }) => void;
  applyBlurPresetSettings: (settings: {
    amount: number;
    blurType: 'solid';
    showBorder: boolean;
  }) => void;
};

function createBlurSidebarActionArgs(args: {
  activeTool: 'select' | 'blur';
  hasSelection: boolean;
  overrides?: Record<string, unknown>;
}) {
  const params = createInspectorCommandParams();
  return {
    activeTool: args.activeTool,
    confirmOpenStorageManager: vi.fn(async () => false),
    defaultImagePresetId: 'preset-default',
    savePresets: params.savePresets,
    selection: {
      ...params.selection,
      hasSelection: args.hasSelection,
      selectedObjectType: args.hasSelection ? 'blur' : null,
    },
    setBrowserFrame: vi.fn(),
    setFrameDraft: vi.fn(),
    shapeSettings: params.inspectorToolSettings.rectangle,
    shapeTool: 'rectangle',
    textSettings: params.inspectorToolSettings.text,
    updateArrowSettings: vi.fn(),
    updateBlurSettings: vi.fn(),
    updateBrushSettings: vi.fn(),
    updateSelectionBlurSettings: vi.fn(),
    updateSelectionArrowSettings: vi.fn(),
    updateSelectionBrushSettings: vi.fn(),
    updateSelectionShapeSettings: vi.fn(),
    updateSelectionStepSettings: vi.fn(),
    updateSelectionTextSettings: vi.fn(),
    updateShapeSettings: vi.fn(),
    updateStepSettings: vi.fn(),
    updateTextSettings: vi.fn(),
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
    ...args.overrides,
  } as never;
}

async function renderBlurActions(args: {
  activeTool: 'select' | 'blur';
  controller: ReturnType<typeof createControllerMock>;
  hasSelection: boolean;
  overrides?: Record<string, unknown>;
}): Promise<BlurActions> {
  const { useEditorInspectorSidebarActions } = await import('./actions');
  let value: BlurActions | null = null;

  const Harness = () => {
    value = useEditorInspectorSidebarActions(
      createBlurSidebarActionArgs(args),
      false
    ) as BlurActions;

    return null;
  };

  await renderWithControllerAsync(<Harness />, args.controller);
  if (!value) {
    throw new Error('Expected blur actions to render');
  }
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('editor sidebar blur patch actions', () => {
  it('routes blur patches into selection-owned apply flow', async () => {
    const controller = createControllerMock();
    const updateSelectionBlurSettings = vi.fn();
    const actions = await renderBlurActions({
      activeTool: 'select',
      controller,
      hasSelection: true,
      overrides: { updateSelectionBlurSettings },
    });

    actions.applyBlurPatch({ amount: 12 });

    expect(updateSelectionBlurSettings).toHaveBeenCalledWith({ amount: 12 });
    expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledOnce();
  });
});

describe('editor sidebar blur preset actions', () => {
  it('applies blur preset settings to both selection and defaults when selection is active', async () => {
    const controller = createControllerMock();
    const updateSelectionBlurSettings = vi.fn();
    const updateBlurSettings = vi.fn();
    const actions = await renderBlurActions({
      activeTool: 'select',
      controller,
      hasSelection: true,
      overrides: { updateSelectionBlurSettings, updateBlurSettings },
    });

    actions.applyBlurPresetSettings({
      amount: 14,
      blurType: 'solid',
      showBorder: true,
    });

    expect(updateSelectionBlurSettings).toHaveBeenCalledWith({
      amount: 14,
      blurType: 'solid',
      showBorder: true,
    });
    expect(updateBlurSettings).toHaveBeenCalledWith({
      amount: 14,
      blurType: 'solid',
      showBorder: true,
    });
    expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledOnce();
  });
});
