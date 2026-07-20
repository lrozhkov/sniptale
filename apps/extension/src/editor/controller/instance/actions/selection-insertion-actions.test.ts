import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertEditorControllerImage: vi.fn(async () => undefined),
  insertEditorControllerTechnicalData: vi.fn(),
}));

vi.mock('../../public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api')>()),
  insertEditorControllerImage: mocks.insertEditorControllerImage,
  insertEditorControllerTechnicalData: mocks.insertEditorControllerTechnicalData,
}));

import {
  insertImageForController,
  insertTechnicalDataForController,
} from './selection-insertion-actions';

function createController() {
  return {
    getPublicApiAdapter: vi.fn(() => ({ id: 'adapter' })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('routes selection insertion commands through the public api adapter', async () => {
  const controller = createController();

  await insertImageForController(controller as never, 'data:image/png;base64,image', 'image.png');
  insertTechnicalDataForController(controller as never, ['browser', 'url'], 'row');

  expect(mocks.insertEditorControllerImage).toHaveBeenCalledWith(
    { id: 'adapter' },
    'data:image/png;base64,image',
    'image.png'
  );
  expect(mocks.insertEditorControllerTechnicalData).toHaveBeenCalledWith(
    { id: 'adapter' },
    ['browser', 'url'],
    'row'
  );
});
