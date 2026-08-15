// @vitest-environment jsdom

import { Textbox } from 'fabric';
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

beforeEach(() => vi.clearAllMocks());

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
