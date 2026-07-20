import { expect, it } from 'vitest';

import { buildStepColorCommand, buildStepTextColorCommand } from './color';
import { createInspectorCommandParams } from '../../../../../../../../../tooling/test/harness/editor/ownership/fixtures';

it('wires commit handlers for the step color command', () => {
  const params = createInspectorCommandParams();
  const command = buildStepColorCommand(params as never, params.inspectorToolSettings.step);
  const colorControl = (command.content as any).props.children;

  colorControl.props.onChange('#d4d4d8');
  colorControl.props.onPreviewChange('#cbd5e1');
  colorControl.props.onPreviewReset('#0f172a');

  expect(params.updateColor).toHaveBeenCalledOnce();
  expect(params.previewColor).toHaveBeenCalledTimes(2);
});

it('keeps the text color label visible in compact step popovers', () => {
  const params = createInspectorCommandParams();
  const command = buildStepTextColorCommand(params as never, params.inspectorToolSettings.step);

  expect(command.preservePopoverLabel).toBe(true);
});
