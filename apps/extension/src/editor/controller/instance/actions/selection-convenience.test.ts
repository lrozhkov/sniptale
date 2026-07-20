import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertEditorControllerRichShapeWithOptions: vi.fn(),
  moveSelectionForController: vi.fn(),
  moveSelectionToEdgeForController: vi.fn(),
}));

vi.mock('../helpers/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers/object')>()),
  moveSelectionForController: mocks.moveSelectionForController,
  moveSelectionToEdgeForController: mocks.moveSelectionToEdgeForController,
}));

vi.mock('../../public-api/rich-shape-insertion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/rich-shape-insertion')>()),
  insertEditorControllerRichShapeWithOptions: mocks.insertEditorControllerRichShapeWithOptions,
}));

import {
  bringForwardSelectionForController,
  bringSelectionToFrontForController,
  insertRichShapeForController,
  sendBackwardSelectionForController,
  sendSelectionToBackForController,
} from './selection';

function createController() {
  return {
    getPublicApiAdapter: vi.fn(() => ({ id: 'adapter' })),
  };
}

it('routes selection ordering aliases through object helper owners', () => {
  const controller = createController();

  bringForwardSelectionForController(controller as never);
  sendBackwardSelectionForController(controller as never);
  bringSelectionToFrontForController(controller as never);
  sendSelectionToBackForController(controller as never);

  expect(mocks.moveSelectionForController).toHaveBeenCalledWith(controller, 1);
  expect(mocks.moveSelectionForController).toHaveBeenCalledWith(controller, -1);
  expect(mocks.moveSelectionToEdgeForController).toHaveBeenCalledWith(controller, 'front');
  expect(mocks.moveSelectionToEdgeForController).toHaveBeenCalledWith(controller, 'back');
});

it('routes rich shape insertion through the public adapter owner', () => {
  const controller = createController();

  insertRichShapeForController(controller as never, 'block-arrow', { rough: true });

  expect(mocks.insertEditorControllerRichShapeWithOptions).toHaveBeenCalledWith(
    { id: 'adapter' },
    'block-arrow',
    { rough: true }
  );
});
