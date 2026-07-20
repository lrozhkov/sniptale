import { createMockControllerCoreMethods } from './test-fixtures-controller/core-methods.test-support';
import { createMockControllerDocumentMethods } from './test-fixtures-controller/document-methods.test-support';
import { createMockControllerState } from './test-fixtures-controller/state';
import type { MockEditorController } from './test-fixtures-controller/types';

export function createMockController() {
  return {
    ...createMockControllerState(),
    ...createMockControllerCoreMethods(),
    ...createMockControllerDocumentMethods(),
  } as unknown as MockEditorController;
}
