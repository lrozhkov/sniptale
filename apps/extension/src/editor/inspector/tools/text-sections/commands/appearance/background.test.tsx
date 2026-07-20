import { expect, it } from 'vitest';
import {
  buildTextAppearanceBackgroundCommand,
  buildTextAppearanceBackgroundOpacityCommand,
} from './background';
import { createTextCommandParams } from './test-support';

it('builds the text background command with the expected trigger and palette', () => {
  const params = createTextCommandParams();
  const command = buildTextAppearanceBackgroundCommand(params);
  const colorControl = (command.content as any).props.children;

  expect(command.id).toBe('text-background');
  expect(command.value).toBe('#111111');
  colorControl.props.onPreviewChange('#112233');
  colorControl.props.onPreviewReset('#223344');
  expect(params.previewColor).toHaveBeenCalledTimes(2);

  const opacityCommand = buildTextAppearanceBackgroundOpacityCommand(params);
  ((opacityCommand.content as any).props.children as any).props.onPreviewValue(140);

  expect(opacityCommand.id).toBe('text-background-opacity');
  expect(params.previewTextPatch).toHaveBeenCalledWith({ backgroundOpacity: 1 });
});
