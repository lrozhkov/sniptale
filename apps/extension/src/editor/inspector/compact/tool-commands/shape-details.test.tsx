import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildShapeCompactCommands } from './shape';

it('builds shape compact color commands without preview passthrough', () => {
  const params = createInspectorCommandParams();
  const commands = buildShapeCompactCommands(params as never);
  const strokeControl = ((commands[1]?.content as any).props.children as any).props;
  const fillControl = ((commands[2]?.content as any).props.children as any).props;

  expect(commands.map((command) => command.icon)).toEqual([
    'preset',
    'color',
    'color',
    'size',
    'trajectory',
    'size',
    'opacity',
    'opacity',
    'opacity',
  ]);
  expect(commands.map((command) => command.id)).toContain('shape-stroke-opacity');
  expect(commands.map((command) => command.id)).toContain('shape-fill-opacity');
  expect(renderToStaticMarkup(<>{commands[0]?.trigger}</>)).not.toContain('PRE');
  expect(commands[0]?.preservePopoverLabel).toBe(true);
  expect(commands[1]?.preservePopoverLabel).toBe(true);
  expect(commands[2]?.preservePopoverLabel).toBe(true);
  expect(commands[4]?.preservePopoverLabel).toBe(true);
  expect((commands[4]?.content as any).props.label as string).toBe(
    translate('editor.compact.lineType')
  );
  expect(commands[5]?.preservePopoverLabel).toBe(true);
  expect(strokeControl.onPreviewChange).toEqual(expect.any(Function));
  expect(fillControl.onPreviewChange).toEqual(expect.any(Function));
  expect(strokeControl.onPreviewReset).toEqual(expect.any(Function));

  (strokeControl.onChange as (value: string) => void)('#ff00aa');
  (fillControl.onChange as (value: string) => void)('#00ffaa');
  (strokeControl.onPreviewChange as (value: string) => void)('#aa00ff');
  (fillControl.onPreviewReset as (value: string) => void)('#00aaff');

  expect(params.updateColor).toHaveBeenCalledTimes(2);
  expect(params.previewColor).toHaveBeenCalledTimes(2);
});

it('builds separate compact shape opacity commands for stroke and fill', () => {
  const params = createInspectorCommandParams();
  const commands = buildShapeCompactCommands(params as never);
  const strokeOpacityCommand = commands.find((command) => command.id === 'shape-stroke-opacity');
  const fillOpacityCommand = commands.find((command) => command.id === 'shape-fill-opacity');

  expect(commands.map((command) => command.id)).not.toContain('shape-opacity');
  expect(strokeOpacityCommand?.title).toBe(translate('highlighter.editor.strokeOpacityLabel'));
  expect(fillOpacityCommand?.title).toBe(translate('highlighter.editor.fillOpacityLabel'));
  expect(strokeOpacityCommand?.value).toMatch(/%$/);
  expect(fillOpacityCommand?.value).toMatch(/%$/);

  ((strokeOpacityCommand?.content as any).props.children as any).props.onCommitValue(90);
  ((fillOpacityCommand?.content as any).props.children as any).props.onCommitValue(35);

  expect(params.previewShapePatch).toHaveBeenCalledWith({ strokeOpacity: 0.9 });
  expect(params.previewShapePatch).toHaveBeenCalledWith({ fillOpacity: 0.35 });
  expect(params.applyShapePatch).not.toHaveBeenCalledWith({ opacity: expect.any(Number) });
  expect(params.commitPendingSelectionSettings).toHaveBeenCalledTimes(2);
});
