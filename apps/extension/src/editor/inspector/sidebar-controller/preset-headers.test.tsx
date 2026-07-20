// @vitest-environment jsdom
/* eslint-disable max-lines-per-function -- preset-header routing proof keeps tool and scene owner mapping together */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookMocks = vi.hoisted(() => ({
  pickSceneBackgroundSettings: vi.fn(() => ({ backgroundMode: 'color' })),
  resolveActiveToolPresetOwner: vi.fn(),
  useBorderPresetHeader: vi.fn(() => ({ id: 'rectangle-header' })),
  useEditorStoredPresetHeader: vi.fn(() => ({ id: 'stored-header' })),
}));

vi.mock('./preset-header/border', () => ({
  useBorderPresetHeader: hookMocks.useBorderPresetHeader,
}));

vi.mock('./preset-header/editor', () => ({
  useEditorStoredPresetHeader: hookMocks.useEditorStoredPresetHeader,
}));

vi.mock('./preset-header/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./preset-header/shared')>()),
  pickSceneBackgroundSettings: hookMocks.pickSceneBackgroundSettings,
  resolveActiveToolPresetOwner: hookMocks.resolveActiveToolPresetOwner,
}));

import { useEditorInspectorPresetHeaders } from './preset-headers';

type PresetHeadersArgs = Parameters<typeof useEditorInspectorPresetHeaders>[0];
type RectangleBorderHeaderArgs = {
  applySettings: PresetHeadersArgs['applyShapePresetSettings'] extends (
    owner: infer _Owner,
    settings: infer Settings
  ) => void
    ? (settings: Settings) => void
    : never;
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof useEditorInspectorPresetHeaders> | null = null;
let applyBrushPresetSettings: PresetHeadersArgs['applyBrushPresetSettings'];
let applyShapePresetSettings: PresetHeadersArgs['applyShapePresetSettings'];
let applyBlurPresetSettings: PresetHeadersArgs['applyBlurPresetSettings'];
let applyArrowPresetSettings: PresetHeadersArgs['applyArrowPresetSettings'];
let applyTextPresetSettings: PresetHeadersArgs['applyTextPresetSettings'];
let applyStepPresetSettings: PresetHeadersArgs['applyStepPresetSettings'];

function Harness(props: Parameters<typeof useEditorInspectorPresetHeaders>[0]) {
  latestValue = useEditorInspectorPresetHeaders(props);
  return null;
}

async function renderHarness(activeTool: 'ellipse' | 'select') {
  applyBrushPresetSettings = vi.fn<PresetHeadersArgs['applyBrushPresetSettings']>();
  applyShapePresetSettings = vi.fn<PresetHeadersArgs['applyShapePresetSettings']>();
  applyBlurPresetSettings = vi.fn<PresetHeadersArgs['applyBlurPresetSettings']>();
  applyArrowPresetSettings = vi.fn<PresetHeadersArgs['applyArrowPresetSettings']>();
  applyTextPresetSettings = vi.fn<PresetHeadersArgs['applyTextPresetSettings']>();
  applyStepPresetSettings = vi.fn<PresetHeadersArgs['applyStepPresetSettings']>();

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <Harness
        activeTool={activeTool}
        borderPresets={[]}
        defaultBorderPresetId="border-default"
        editorPresetState={{
          pencil: { defaultPresetId: 'pencil', presets: [] },
          highlighter: { defaultPresetId: 'highlighter', presets: [] },
          ellipse: { defaultPresetId: 'ellipse', presets: [] },
          blur: { defaultPresetId: 'blur', presets: [] },
          arrow: { defaultPresetId: 'arrow', presets: [] },
          line: { defaultPresetId: 'line', presets: [] },
          text: { defaultPresetId: 'text', presets: [] },
          step: { defaultPresetId: 'step', presets: [] },
          sceneBackground: { defaultPresetId: 'scene', presets: [] },
          palette: {
            shapeStroke: ['#111111'],
            shapeFill: ['#222222'],
            textColor: ['#333333'],
            textBackground: ['#444444'],
            sceneBackground: ['#555555'],
          },
        }}
        frameDraft={{
          paddingTop: 128,
          paddingRight: 96,
          paddingBottom: 64,
          paddingLeft: 32,
          backgroundMode: 'color',
          backgroundColor: '#ffffff',
          backgroundGradientFrom: '#111111',
          backgroundGradientTo: '#222222',
          backgroundGradientAngle: 90,
          backgroundImageData: null,
          backgroundImageFit: 'cover',
          layoutMode: 'expand-canvas',
        }}
        toolSettings={{
          pencil: { color: '#111111' } as never,
          highlighter: { color: '#222222' } as never,
          rectangle: { borderPresetId: 'border-default' } as never,
          ellipse: { strokeColor: '#333333' } as never,
          blur: { amount: 10, blurType: 'gaussian', showBorder: false } as never,
          arrow: { color: '#444444' } as never,
          line: { color: '#777777' } as never,
          text: { textColor: '#555555' } as never,
          step: { color: '#666666' } as never,
        }}
        applyBrushPresetSettings={applyBrushPresetSettings}
        applyShapePresetSettings={applyShapePresetSettings}
        applyBlurPresetSettings={applyBlurPresetSettings}
        applyArrowPresetSettings={applyArrowPresetSettings}
        applyTextPresetSettings={applyTextPresetSettings}
        applyStepPresetSettings={applyStepPresetSettings}
        setFrameSettings={vi.fn()}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  latestValue = null;
  vi.unstubAllGlobals();
});

describe('useEditorInspectorPresetHeaders', () => {
  it('routes rectangle/scene headers through their dedicated owners', async () => {
    hookMocks.resolveActiveToolPresetOwner.mockReturnValue('rectangle');

    await renderHarness('select');

    expect(hookMocks.useBorderPresetHeader).toHaveBeenCalledOnce();
    expect(hookMocks.useEditorStoredPresetHeader).toHaveBeenCalledTimes(9);
    expect(hookMocks.pickSceneBackgroundSettings).toHaveBeenCalledOnce();
    expect(hookMocks.useEditorStoredPresetHeader).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseOwner: 'sceneBackground',
        family: 'sceneBackground',
      })
    );
    const borderArgs = (
      hookMocks.useBorderPresetHeader.mock.calls as unknown as Array<[RectangleBorderHeaderArgs]>
    )[0]?.[0];
    expect(borderArgs).toBeDefined();
    borderArgs?.applySettings({ strokeColor: '#ff6600' } as never);
    expect(applyShapePresetSettings).toHaveBeenCalledWith('rectangle', {
      strokeColor: '#ff6600',
    });
    expect(latestValue).toEqual({
      scenePresetHeader: { id: 'stored-header' },
      toolPresetHeader: { id: 'rectangle-header' },
    });
  });

  it('returns null for tool preset headers when no active tool owner is available', async () => {
    hookMocks.resolveActiveToolPresetOwner.mockReturnValue(null);

    await renderHarness('ellipse');

    const ellipseArgs = (
      hookMocks.useEditorStoredPresetHeader.mock.calls as unknown as Array<
        [RectangleBorderHeaderArgs]
      >
    )[2]?.[0];
    expect(ellipseArgs).toBeDefined();
    ellipseArgs?.applySettings({ strokeColor: '#333333' } as never);
    expect(applyShapePresetSettings).toHaveBeenCalledWith('ellipse', {
      strokeColor: '#333333',
    });
    expect(latestValue?.scenePresetHeader).toEqual({ id: 'stored-header' });
    expect(latestValue?.toolPresetHeader).toBeNull();
  });
});
