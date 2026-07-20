import { getLifecycleMocks } from './controller-instance-delegation-test-support/lifecycle.test-support';
import { getRichShapeMocks } from './controller-instance-delegation-test-support/rich-shape.test-support';
import { getSceneMocks } from './controller-instance-delegation-test-support/scene.test-support';
import { getSelectionMocks } from './controller-instance-delegation-test-support/selection.test-support';

const lifecycleMocks = getLifecycleMocks();
const richShapeMocks = getRichShapeMocks();
const sceneMocks = getSceneMocks();
const selectionMocks = getSelectionMocks();

export const helperMocks = {
  ...lifecycleMocks,
  ...richShapeMocks,
  ...sceneMocks,
  ...selectionMocks,
};
