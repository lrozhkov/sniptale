import { expect, it } from 'vitest';

import { createToolsPanelProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { createArrowControlsProps } from './tool-props';

it('threads arrow controls through the tool props adapter', () => {
  const props = createToolsPanelProps();
  const arrowProps = createArrowControlsProps(props as never);

  expect(arrowProps.applyArrowPatch).toBe(props.applyArrowPatch);
  expect(arrowProps.previewArrowPatch).toBe(props.previewArrowPatch);
  expect(arrowProps.lineStyleOptions).toBe(props.lineStyleOptions);
  expect(arrowProps.arrowHeadOptions).toBe(props.arrowHeadOptions);
  expect(arrowProps.commitPendingSelectionSettings).toBe(props.commitPendingSelectionSettings);
});
