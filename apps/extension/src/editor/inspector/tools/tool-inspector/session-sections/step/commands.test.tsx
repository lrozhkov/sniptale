import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { createInspectorCommandParams } from '../../../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildStepSizeCommand } from './size';
import { buildStepValueCommand } from './value';

function getStepValueInputProps(command: ReturnType<typeof buildStepValueCommand>) {
  const input = (command.content as any).props.children;
  return input.type(input.props).props;
}

it('builds step compact commands with preview and commit routing', () => {
  const params = createInspectorCommandParams();
  const settings = params.inspectorToolSettings.step;
  const sizeCommand = buildStepSizeCommand(params as never, settings);
  const valueCommand = buildStepValueCommand(params as never, settings.value, settings);
  const sizeControl = (sizeCommand.content as any).props.children.props;
  const valueControl = getStepValueInputProps(valueCommand);

  expect(renderToStaticMarkup(<>{sizeCommand.trigger}</>)).toContain(String(settings.sizeLevel));
  expect(renderToStaticMarkup(<>{sizeCommand.trigger}</>)).not.toContain('SZ');
  expect(sizeCommand.preservePopoverLabel).toBe(true);
  valueControl.onChange({ currentTarget: { value: '3' } });
  expect(params.previewStepPatch).toHaveBeenNthCalledWith(1, { value: '3' });
  valueControl.onValueCommit();
  sizeControl.onCommitValue(20);

  expect(sizeControl.max).toBe(20);
  expect(params.previewStepPatch).toHaveBeenNthCalledWith(2, { sizeLevel: 20 });
  expect(params.commitPendingSelectionSettings).toHaveBeenCalledTimes(2);
});

it('uses text-mode input constraints for non-numeric step values', () => {
  const params = createInspectorCommandParams();
  const settings = {
    ...params.inspectorToolSettings.step,
    alphabet: 'latin' as const,
    type: 'letter' as const,
    value: 'A',
  };
  const valueCommand = buildStepValueCommand(params as never, settings.value, settings);
  const valueControl = getStepValueInputProps(valueCommand);

  expect(valueControl.inputMode).toBe('text');
  expect(valueControl.maxLength).toBe(1);
  expect(valueControl.pattern).toBeUndefined();

  valueControl.onChange({ currentTarget: { value: 'B' } });
  valueControl.onValueCommit();

  expect(params.previewStepPatch).toHaveBeenCalledWith({ value: 'B' });
  expect(params.commitPendingSelectionSettings).toHaveBeenCalledOnce();
});
