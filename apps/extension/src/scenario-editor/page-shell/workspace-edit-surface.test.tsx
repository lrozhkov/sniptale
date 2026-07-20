// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createScenarioSlide } from '../../features/scenario/project/v3';
import type { ScenarioCanvasStageProps } from '../canvas/types';
import { ScenarioV3EditSurface } from './workspace-edit-surface';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let stageProps: ScenarioCanvasStageProps | null = null;

vi.mock('../canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../canvas')>()),
  ScenarioCanvasStage: (props: ScenarioCanvasStageProps) => {
    stageProps = props;
    return <div data-ui="scenario.canvas.stage" />;
  },
}));

function renderEditSurface() {
  const editor = {
    elementActions: {
      deleteElement: vi.fn(),
      insertElementAtPoint: vi.fn(),
      insertElementFromDrag: vi.fn(),
      selectElement: vi.fn(),
      selectSlideSurface: vi.fn(),
      updateElement: vi.fn(),
    },
    selectedElementId: null,
    selectedSlide: createScenarioSlide({ id: 'slide-1', title: 'Slide' }),
  };
  const onActiveInsertKindChange = vi.fn();
  const onClearInspectorTool = vi.fn();
  const onEditImageElement = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ScenarioV3EditSurface
        activeInsertKind="text"
        assetState={{ assets: {}, loading: false }}
        canvasViewport={createViewportController()}
        clickIndex={2}
        editor={editor as never}
        onActiveInsertKindChange={onActiveInsertKindChange}
        onClearInspectorTool={onClearInspectorTool}
        onEditImageElement={onEditImageElement}
      />
    );
  });

  return { editor, onActiveInsertKindChange, onClearInspectorTool, onEditImageElement };
}

function createViewportController() {
  return {
    controls: {} as never,
    gridVisible: true,
    magnetEnabled: false,
    scale: 1,
    snapToGrid: false,
    viewportRef: { current: null },
  };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  stageProps = null;
});

it('routes scenario edit-surface canvas mutations through editor actions', () => {
  const { editor, onActiveInsertKindChange, onClearInspectorTool } = renderEditSurface();

  act(() => {
    stageProps?.onInsertElementAtPoint?.('text', { x: 10, y: 12 });
    stageProps?.onInsertElementFromDrag?.('shape', { x: 1, y: 2 }, { x: 40, y: 50 });
    stageProps?.onSelectElement('element-1');
    stageProps?.onSelectSlide();
    stageProps?.onClearActiveInsertKind?.();
  });

  expect(editor.elementActions.insertElementAtPoint).toHaveBeenCalledWith('text', { x: 10, y: 12 });
  expect(editor.elementActions.insertElementFromDrag).toHaveBeenCalledWith(
    'shape',
    { x: 1, y: 2 },
    { x: 40, y: 50 }
  );
  expect(editor.elementActions.selectElement).toHaveBeenCalledWith('element-1');
  expect(editor.elementActions.selectSlideSurface).toHaveBeenCalledTimes(1);
  expect(onActiveInsertKindChange).toHaveBeenCalledWith(null);
  expect(onClearInspectorTool).toHaveBeenCalledTimes(2);
});
