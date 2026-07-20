// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  createControllerMock,
  getEditorInspectorOwnershipMocks,
  renderWithControllerAsync,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { useEditorStore } from '../../state/useEditorStore';

const { appendBorderPresetMock, rememberRecentColorMock } = vi.hoisted(() => ({
  appendBorderPresetMock: vi.fn(),
  rememberRecentColorMock: vi.fn(async () => undefined),
}));

vi.mock('./actions.state', () => ({
  useBorderPresetsState: () => ({
    appendBorderPreset: appendBorderPresetMock,
    borderPresets: [DEFAULT_BORDER_PRESET],
    defaultBorderPresetId: DEFAULT_BORDER_PRESET.id,
  }),
  useRecentColorsState: () => ({
    recentColors: [],
    rememberRecentColor: rememberRecentColorMock,
  }),
}));

type SidebarUtilityActions = {
  insertOrUpdateBrowserFrame?: () => Promise<void>;
  saveShapeAsHighlighterPreset: () => Promise<void>;
  syncBrowserFrame: (updates: { title?: string; url?: string }) => Promise<void>;
};

function createSidebarActionArgs(overrides: Record<string, unknown> = {}) {
  const params = createInspectorCommandParams();
  return {
    activeTool: 'select',
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    confirmOpenStorageManager: vi.fn(async () => false),
    defaultImagePresetId: 'preset-default',
    savePresets: params.savePresets,
    selection: params.selection,
    setBrowserFrame: vi.fn(),
    setFrameDraft: vi.fn(),
    shapeSettings: params.inspectorToolSettings.rectangle,
    shapeTool: 'rectangle',
    textSettings: params.inspectorToolSettings.text,
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
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
    ...overrides,
  } as never;
}

async function renderUtilityActions(args: {
  controller: ReturnType<typeof createControllerMock>;
  hasImage: boolean;
  overrides?: Record<string, unknown>;
}): Promise<SidebarUtilityActions> {
  const { useEditorInspectorSidebarActions } = await import('./actions');
  let actions: SidebarUtilityActions | null = null;

  const Harness = () => {
    actions = useEditorInspectorSidebarActions(
      createSidebarActionArgs(args.overrides ?? {}),
      args.hasImage
    ) as SidebarUtilityActions;
    return null;
  };

  await renderWithControllerAsync(<Harness />, args.controller);
  if (!actions) {
    throw new Error('Expected utility actions to render');
  }
  return actions;
}

function registerLocalBrowserFrameFallbackTest() {
  it('uses local browser-frame fallback when no image is loaded', async () => {
    const controller = createControllerMock();
    const setBrowserFrame = vi.fn();
    const actions = await renderUtilityActions({
      controller,
      hasImage: false,
      overrides: { setBrowserFrame },
    });

    await actions.syncBrowserFrame({ title: 'Local draft' });

    expect(setBrowserFrame).toHaveBeenCalledWith(expect.objectContaining({ title: 'Local draft' }));
    expect(controller.applyBrowserFrame).not.toHaveBeenCalled();
    await actions.insertOrUpdateBrowserFrame?.();
    expect(controller.applyBrowserFrame).not.toHaveBeenCalled();
  });
}

function registerControllerBrowserFrameSyncTest() {
  it('keeps browser-frame sync local and applies the current draft on insert/update', async () => {
    const controller = createControllerMock();
    const setBrowserFrame = vi.fn((nextBrowserFrame) => {
      useEditorStore.setState({ browserFrame: nextBrowserFrame });
    });
    const actions = await renderUtilityActions({
      controller,
      hasImage: true,
      overrides: {
        browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE, title: 'Draft title' },
        setBrowserFrame,
      },
    });

    await actions.syncBrowserFrame({ title: 'Updated title' });
    await actions.insertOrUpdateBrowserFrame?.();

    expect(controller.applyBrowserFrame).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Updated title' })
    );
    expect(setBrowserFrame).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Updated title' })
    );
  });
}

function registerPresetSaveSuccessTest() {
  it('saves a highlighter preset and re-targets the active shape on success', async () => {
    const controller = createControllerMock();
    const updateSelectionShapeSettings = vi.fn();
    const storageMocks = getEditorInspectorOwnershipMocks();
    const uuidSpy = vi.spyOn(crypto, 'randomUUID');
    uuidSpy.mockReturnValue('preset-new' as ReturnType<typeof crypto.randomUUID>);

    try {
      const actions = await renderUtilityActions({
        controller,
        hasImage: false,
        overrides: {
          shapeSettings: {
            ...createInspectorCommandParams().inspectorToolSettings.rectangle,
            fillColor: '#00ff00',
            strokeColor: '#112233',
          },
          updateSelectionShapeSettings,
        },
      });

      await actions.saveShapeAsHighlighterPreset();

      expect(storageMocks.addBorderPresetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fillColor: '#00ff00',
          id: 'preset-new',
          color: '#112233',
        })
      );
      expect(appendBorderPresetMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'preset-new' })
      );
      expect(updateSelectionShapeSettings).toHaveBeenCalledWith('rectangle', {
        borderPresetId: 'preset-new',
      });
      expect(storageMocks.toastSuccessMock).toHaveBeenCalledOnce();
    } finally {
      uuidSpy.mockRestore();
    }
  });
}

function registerPresetSaveFailureTest() {
  it('keeps local shape state untouched when highlighter preset persistence fails', async () => {
    const controller = createControllerMock();
    const updateSelectionShapeSettings = vi.fn();
    const storageMocks = getEditorInspectorOwnershipMocks();
    storageMocks.addBorderPresetMock.mockRejectedValueOnce(new Error('storage failed'));
    const actions = await renderUtilityActions({
      controller,
      hasImage: false,
      overrides: { updateSelectionShapeSettings },
    });

    await actions.saveShapeAsHighlighterPreset();

    expect(appendBorderPresetMock).not.toHaveBeenCalled();
    expect(updateSelectionShapeSettings).not.toHaveBeenCalled();
    expect(storageMocks.toastErrorMock).toHaveBeenCalledOnce();
  });
}

describe('editor sidebar utility actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerLocalBrowserFrameFallbackTest();
  registerControllerBrowserFrameSyncTest();
  registerPresetSaveSuccessTest();
  registerPresetSaveFailureTest();
});
