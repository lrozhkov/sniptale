// @vitest-environment jsdom

import { ActiveSelection, Canvas, Group, Point, Textbox, type FabricObject } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';

const isTextbox = vi.hoisted(() => vi.fn());
const activateTextTarget = vi.hoisted(() => vi.fn());
vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox,
}));
vi.mock('../events/text-target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../events/text-target')>()),
  activateTextTarget,
}));

import { handleEditorDoubleClick } from './double-click';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { applyEditorDrawingInteractionControls } from '../../drawing/object/controls/apply';

beforeEach(() => vi.clearAllMocks());

function createBendDeletionFixture(zoom = 1) {
  isTextbox.mockReturnValue(false);
  const canvas = new Canvas(document.createElement('canvas'));
  canvas.setZoom(zoom);
  const drawing = {
    kind: 'arrow' as const,
    id: 'delete-bend',
    design: 'freehand' as const,
    start: { x: 20, y: 20 },
    end: { x: 220, y: 20 },
    bendPoints: [{ x: 120, y: 100 }],
    color: '#f97316',
    width: 12,
    dynamicWidth: false,
  };
  const arrow = createEditorDrawingFabricObject(drawing, 1);
  applyEditorDrawingInteractionControls(arrow);
  canvas.add(arrow);
  canvas.setActiveObject(arrow);
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();
  const click = (key: 'start' | 'end' | 'bend-0', activeTool = 'select') => {
    const control = arrow.controls[key]!;
    const point = control.positionHandler(new Point(), [1, 0, 0, 1, 0, 0], arrow, control);
    handleEditorDoubleClick({
      canvas,
      target: arrow,
      activeTool,
      commitHistory,
      syncRuntimeState,
      event: new MouseEvent('dblclick', { clientX: point.x, clientY: point.y }),
    });
  };
  return { canvas, arrow, drawing, click, commitHistory, syncRuntimeState };
}

it.each([0.2, 1, 4])('removes the last authored bend with one commit at zoom %s', (zoom) => {
  const { canvas, arrow, drawing, click, commitHistory, syncRuntimeState } =
    createBendDeletionFixture(zoom);
  click('bend-0');
  expect(readEditorDrawingObject(arrow)).toEqual({ ...drawing, bendPoints: [] });
  expect(arrow.controls['bend-0']).toBeUndefined();
  expect(commitHistory).toHaveBeenCalledTimes(1);
  expect(syncRuntimeState).toHaveBeenCalledTimes(1);
  void canvas.dispose();
});

it.each(['start', 'end'] as const)('does not delete the %s endpoint or commit history', (key) => {
  const { canvas, arrow, drawing, click, commitHistory } = createBendDeletionFixture();
  click(key);
  expect(readEditorDrawingObject(arrow)).toEqual(drawing);
  expect(commitHistory).not.toHaveBeenCalled();
  void canvas.dispose();
});

it('preserves locked ancestors and unrelated tool modes', () => {
  const { canvas, arrow, drawing, click, commitHistory } = createBendDeletionFixture();
  click('bend-0', 'text');
  canvas.discardActiveObject();
  canvas.remove(arrow);
  const group = new Group([arrow]);
  group.sniptaleLocked = true;
  canvas.add(group);
  canvas.setActiveObject(arrow);
  click('bend-0');
  expect(readEditorDrawingObject(arrow)).toEqual(drawing);
  expect(commitHistory).not.toHaveBeenCalled();
  void canvas.dispose();
});

it.each([
  {
    state: 'hidden',
    disable: (object: FabricObject) => {
      object.visible = false;
    },
  },
  {
    state: 'unselectable',
    disable: (object: FabricObject) => {
      object.selectable = false;
    },
  },
  {
    state: 'without controls',
    disable: (object: FabricObject) => {
      object.hasControls = false;
    },
  },
  {
    state: 'locked',
    disable: (object: FabricObject) => {
      object.sniptaleLocked = true;
    },
  },
])('does not modify an arrow that is $state', ({ disable }) => {
  const { canvas, arrow, drawing, click, commitHistory } = createBendDeletionFixture();
  disable(arrow);
  click('bend-0');
  expect(readEditorDrawingObject(arrow)).toEqual(drawing);
  expect(commitHistory).not.toHaveBeenCalled();
  void canvas.dispose();
});

it('does not mutate an arrow while multiple objects are selected', () => {
  const { canvas, arrow, drawing, click, commitHistory } = createBendDeletionFixture();
  const other = new Textbox('Other');
  canvas.add(other);
  canvas.setActiveObject(new ActiveSelection([arrow, other], { canvas }));
  click('bend-0');
  expect(readEditorDrawingObject(arrow)).toEqual(drawing);
  expect(commitHistory).not.toHaveBeenCalled();
  void canvas.dispose();
});

it('supports an existing bend while the arrow drawing tool remains active', () => {
  const { canvas, arrow, drawing, click, commitHistory } = createBendDeletionFixture();
  click('bend-0', 'arrow');
  expect(readEditorDrawingObject(arrow)).toEqual({ ...drawing, bendPoints: [] });
  expect(commitHistory).toHaveBeenCalledTimes(1);
  void canvas.dispose();
});

it('enters existing text editing only from the selection tool', () => {
  const target = new Textbox('Text');
  vi.spyOn(target, 'enterEditing');
  vi.spyOn(target, 'selectAll');
  isTextbox.mockReturnValue(true);
  const canvas = { id: 'canvas' };
  const event = new MouseEvent('dblclick');

  Reflect.apply(handleEditorDoubleClick, null, [
    {
      activeTool: 'select',
      canvas,
      commitHistory: vi.fn(),
      event,
      syncRuntimeState: vi.fn(),
      target,
    },
  ]);

  expect(target.enterEditing).not.toHaveBeenCalled();
  expect(target.selectAll).not.toHaveBeenCalled();
  expect(activateTextTarget).toHaveBeenCalledWith(canvas, target, expect.any(Function), {
    event,
    selectAll: false,
  });
});

it('ignores unsupported targets and non-selection tools', () => {
  const target = new Textbox('Text');
  vi.spyOn(target, 'enterEditing');
  isTextbox.mockReturnValueOnce(false).mockReturnValueOnce(true);
  const options = {
    canvas: null,
    commitHistory: vi.fn(),
    event: new MouseEvent('dblclick'),
    syncRuntimeState: vi.fn(),
    target,
  };

  handleEditorDoubleClick({ ...options, activeTool: 'select' });
  handleEditorDoubleClick({ ...options, activeTool: 'text' });

  expect(target.enterEditing).not.toHaveBeenCalled();
});
