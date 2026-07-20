import { expect, it } from 'vitest';
import { buildTextAppearanceCommands } from './build';
import { createTextCommandParams, getTextAppearanceCommandControl } from './test-support';

it('builds the color and background commands', () => {
  const commands = buildTextAppearanceCommands(
    createTextCommandParams({
      inspectorToolSettings: {
        text: {
          calloutFormat: 'bubble',
        },
      },
      textCalloutFormatOptions: [{ value: 'bubble', label: 'Bubble' }],
    })
  );

  expect(commands.map((command) => command.id)).toEqual([
    'text-color',
    'text-opacity',
    'text-background',
    'text-background-opacity',
  ]);
  expect(commands[0]?.value).toBe('#222222');
  expect(commands[1]?.value).toBe('100%');
  expect(commands[2]?.value).toBe('#111111');
  expect(commands[3]?.value).toBe('100%');
});

it('keeps background commands for plain text', () => {
  const commands = buildTextAppearanceCommands(createTextCommandParams());

  expect(commands.map((command) => command.id)).toEqual([
    'text-color',
    'text-opacity',
    'text-background',
    'text-background-opacity',
  ]);
});

it('wires color handlers through the returned controls', () => {
  const params = createTextCommandParams({
    inspectorToolSettings: {
      text: {
        calloutFormat: 'bubble',
      },
    },
  });
  const commands = buildTextAppearanceCommands(params);

  const colorControl = getTextAppearanceCommandControl(commands, 0);
  const textOpacityControl = getTextAppearanceCommandControl(commands, 1);
  const backgroundControl = getTextAppearanceCommandControl(commands, 2);
  const backgroundOpacityControl = getTextAppearanceCommandControl(commands, 3);

  (colorControl.props['onChange'] as (color: string) => void)('#444444');
  (textOpacityControl.props['onPreviewValue'] as (value: number) => void)(60);
  (backgroundControl.props['onChange'] as (color: string) => void)('#666666');
  (backgroundOpacityControl.props['onPreviewValue'] as (value: number) => void)(40);

  expect(params.applyTextPatch).not.toHaveBeenCalledWith({ calloutFormat: expect.any(String) });
  expect(params.previewTextPatch).toHaveBeenCalledWith({ textOpacity: 0.6 });
  expect(params.previewTextPatch).toHaveBeenCalledWith({ backgroundOpacity: 0.4 });
  expect(params.updateColor).toHaveBeenCalledTimes(2);
});
