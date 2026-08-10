import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock('./preset-header/editor', () => ({
  useEditorStoredPresetHeader: (args: Record<string, unknown>) => {
    mocks.calls.push(args);
    return { family: args['family'] };
  },
}));

import { createDefaultEditorPresetStorageState } from '../../../composition/persistence/editor-presets/defaults';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { useEditorInspectorPresetHeaders } from './preset-headers';

function createArgs(activeTool: 'step' | 'select') {
  const editorPresetState = createDefaultEditorPresetStorageState();
  return {
    activeTool,
    applyStepPresetSettings: vi.fn(),
    editorPresetState,
    frameDraft: {
      backgroundColor: '#000000',
      backgroundGradientAngle: 0,
      backgroundGradientFrom: '#111111',
      backgroundGradientTo: '#222222',
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      backgroundMode: 'solid',
      layoutMode: 'freeform',
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
    },
    setFrameSettings: vi.fn(),
    toolSettings: DEFAULT_EDITOR_TOOL_SETTINGS,
  } as any;
}

it('composes scene and active step preset headers', () => {
  const step = useEditorInspectorPresetHeaders(createArgs('step'));
  expect(step.toolPresetHeader).toEqual({ family: 'step' });
  expect(step.scenePresetHeader).toEqual({ family: 'sceneBackground' });
  expect(mocks.calls).toHaveLength(2);

  const select = useEditorInspectorPresetHeaders(createArgs('select'));
  expect(select.toolPresetHeader).toBeNull();
});
