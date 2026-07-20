import { expect, it } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildBlurCompactCommands } from './blur';

function createBorderedBlurCommands() {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.blur = {
    amount: 11,
    blurType: 'distortion',
    radius: 8,
    shadow: 30,
    showBorder: true,
    strokeColor: '#112233',
    strokeOpacity: 0.6,
    strokeStyle: 'dash',
    strokeWidth: 5,
  };
  return { commands: buildBlurCompactCommands(params as never), params };
}

function commitNumeric(control: { onCommitValue?: (value: number) => void }, value: number) {
  control.onCommitValue?.(value);
}

it('adds compact blur frame commands without the border toggle or shadow', () => {
  const { commands, params } = createBorderedBlurCommands();

  expect(commands.map((command) => command.id)).toEqual([
    'blur-type',
    'blur-amount',
    'blur-radius',
    'blur-stroke-width',
    'blur-stroke-style',
    'blur-stroke-color',
    'blur-stroke-opacity',
  ]);

  const colorControl = ((commands[5]?.content as any).props.children as any).props;
  colorControl.onPreviewChange('#ff00aa');
  colorControl.onPreviewReset('#112233');
  colorControl.onChange('#ff00aa');
  commitNumeric(((commands[2]?.content as any).props.children as any).props, 12);
  commitNumeric(((commands[3]?.content as any).props.children as any).props, 9);
  ((commands[4]?.content as any).props.children as any).props.onChange('dash');
  commitNumeric(((commands[6]?.content as any).props.children as any).props, 90);

  expect(params.previewColor).toHaveBeenCalledTimes(2);
  expect(params.updateColor).toHaveBeenCalledTimes(1);
  expect(params.previewBlurPatch).toHaveBeenCalledWith({ showBorder: true, strokeWidth: 9 });
  expect(params.previewBlurPatch).toHaveBeenCalledWith({ radius: 12 });
  expect(params.applyBlurPatch).toHaveBeenCalledWith({ strokeStyle: 'dash' });
  expect(params.previewBlurPatch).toHaveBeenCalledWith({ strokeOpacity: 0.9 });
});

it('falls back to legacy blur border defaults for compact commands', () => {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.blur = {
    amount: 11,
    blurType: 'distortion',
    showBorder: true,
  };
  const commands = buildBlurCompactCommands(params as never);

  expect(commands.find((command) => command.id === 'blur-stroke-color')?.value).toBe('#475569');
  expect(commands.find((command) => command.id === 'blur-stroke-width')?.value).toBe('0px');
  expect(commands.find((command) => command.id === 'blur-stroke-style')?.value).toBe('Solid');
});
