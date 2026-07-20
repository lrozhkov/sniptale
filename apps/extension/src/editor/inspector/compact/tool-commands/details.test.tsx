import { translate } from '../../../../platform/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildArrowCompactCommands } from './arrow';
import { buildBlurCompactCommands } from './blur';
import { buildToolCompactCommands } from './';
import { buildShapeCompactCommands } from './shape';
import { buildBrushCompactCommands } from './style';

const ARROW_STANDARD_COMMAND_IDS = [
  'arrow-color',
  'arrow-type',
  'arrow-width',
  'arrow-style',
  'arrow-dynamic-width',
  'arrow-roughness',
  'arrow-bowing',
  'arrow-shadow',
  'arrow-start-head',
  'arrow-start-head-size',
  'arrow-end-head',
  'arrow-end-head-size',
];
const ARROW_DYNAMIC_COMMAND_IDS = ARROW_STANDARD_COMMAND_IDS.slice(0, 8);
function commitNumeric(control: { onCommitValue?: (value: number) => void }, value: number) {
  control.onCommitValue?.(value);
}

function triggerArrowCommandInteractions(commands: ReturnType<typeof buildArrowCompactCommands>) {
  (((commands[0]?.content as any).props.children as any).props.onChange as (value: string) => void)(
    '#ff00aa'
  );
  ((commands[1]?.content as any).props.children as any).props.onChange('curved');
  commitNumeric(((commands[2]?.content as any).props.children as any).props, 9);
  ((commands[3]?.content as any).props.children as any).props.onChange('dot');
  commands[4]?.onClick?.();
  commitNumeric(((commands[5]?.content as any).props.children as any).props, 1);
  commitNumeric(((commands[6]?.content as any).props.children as any).props, 2);
  ((commands[8]?.content as any).props.children as any).props.onChange('arrow');
  commitNumeric(((commands[9]?.content as any).props.children as any).props, 2);
  ((commands[10]?.content as any).props.children as any).props.onChange('triangle');
  commitNumeric(((commands[11]?.content as any).props.children as any).props, 3);
}

function expectArrowCompactCommandChrome(commands: ReturnType<typeof buildArrowCompactCommands>) {
  expect(commands[0]?.title).toBe(translate('editor.compact.arrowColor'));
  expect(commands[0]?.preservePopoverLabel).toBe(true);
  expect(commands[3]?.preservePopoverLabel).toBe(true);
  expect(commands[7]?.value).toBe('30/100');
  expect(renderToStaticMarkup(<>{commands[7]?.content}</>)).not.toContain('30/100');
  expect(((commands[0]?.content as any).props.children as any).props.label as string).toBe(
    translate('editor.compact.arrowColor')
  );
  expect((commands[3]?.content as any).props.label as string).toBe(
    translate('editor.compact.lineType')
  );
  expect(renderToStaticMarkup(<>{commands[2]?.trigger}</>)).toContain(commands[2]?.value);
  expect(renderToStaticMarkup(<>{commands[2]?.trigger}</>)).not.toContain('PX');
}

function expectLineCommandChrome(commands: ReturnType<typeof buildToolCompactCommands>) {
  const colorCommand = commands.find((command) => command.id === 'line-color');
  const styleCommand = commands.find((command) => command.id === 'line-style');

  expect(colorCommand?.preservePopoverLabel).toBe(true);
  expect(styleCommand?.preservePopoverLabel).toBe(true);
  expect((colorCommand?.content as any).props.label as string).toBe(
    translate('editor.compact.lineColor')
  );
  expect((styleCommand?.content as any).props.label as string).toBe(
    translate('editor.compact.lineType')
  );
  expect(renderToStaticMarkup(<>{styleCommand?.content}</>)).toContain(
    'shared.ui.compact-inspector.select-field'
  );
}

function expectLineCommandStructuredControls(
  commands: ReturnType<typeof buildToolCompactCommands>
) {
  expect(
    renderToStaticMarkup(<>{commands.find((command) => command.id === 'line-corners')?.content}</>)
  ).toContain('shared.ui.compact-inspector.segmented-field');
  expect(
    renderToStaticMarkup(<>{commands.find((command) => command.id === 'line-fill')?.content}</>)
  ).toContain('shared.ui.compact-inspector.select-field');
  expect(
    renderToStaticMarkup(<>{commands.find((command) => command.id === 'line-fill')?.trigger}</>)
  ).toContain('opacity:0.65');
}

it('builds arrow compact commands with compact mode and shadow controls', () => {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.arrow.variant = 'standard';
  params.inspectorToolSettings.arrow.dynamicWidth = false;
  params.inspectorToolSettings.arrow.shadow = 30;
  const commands = buildArrowCompactCommands(params as never);

  expect(commands.map((command) => command.id)).toEqual(ARROW_STANDARD_COMMAND_IDS);
  expect(commands.map((command) => command.icon)).toEqual([
    'color',
    'trajectory',
    'size',
    'size',
    'trajectory',
    'size',
    'size',
    'trajectory',
    'trajectory',
    'size',
    'trajectory',
    'size',
  ]);
  expectArrowCompactCommandChrome(commands);
  triggerArrowCommandInteractions(commands);

  expect(params.updateColor).toHaveBeenCalledTimes(1);
  expect(params.previewArrowPatch).toHaveBeenCalledWith({ width: 9 });
  expect(params.applyArrowPatch).toHaveBeenCalledWith({ style: 'dot' });
  expect(params.applyArrowPatch).toHaveBeenCalledWith({ arrowType: 'curved', mode: 'curve' });
  expect(params.applyArrowPatch).toHaveBeenCalledWith({ dynamicWidth: true, variant: 'tapered' });
  expect(params.previewArrowPatch).toHaveBeenCalledWith({ roughness: 1 });
  expect(params.previewArrowPatch).toHaveBeenCalledWith({ bowing: 2 });
  expect(params.applyArrowPatch).toHaveBeenCalledWith({ startHead: 'arrow' });
  expect(params.previewArrowPatch).toHaveBeenCalledWith({ startHeadSize: 2 });
  expect(params.applyArrowPatch).toHaveBeenCalledWith({ endHead: 'triangle' });
  expect(params.previewArrowPatch).toHaveBeenCalledWith({ endHeadSize: 3 });
  expect(params.commitPendingSelectionSettings).toHaveBeenCalledTimes(5);
});

it('keeps compact arrow head commands available independently of prior style states', () => {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.arrow.variant = 'standard';
  params.inspectorToolSettings.arrow.dynamicWidth = false;

  expect(buildArrowCompactCommands(params as never).map((command) => command.id)).toEqual(
    ARROW_STANDARD_COMMAND_IDS
  );
});

it('keeps arrow type and reduces only the head commands for dynamic-width arrows', () => {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.arrow.variant = 'tapered';
  params.inspectorToolSettings.arrow.dynamicWidth = true;
  const commands = buildArrowCompactCommands(params as never);

  expect(commands.map((command) => command.id)).toEqual(ARROW_DYNAMIC_COMMAND_IDS);

  commands[4]?.onClick?.();

  expect(params.applyArrowPatch).toHaveBeenCalledWith({ dynamicWidth: false, variant: 'standard' });
});

it('exposes compact commands for the dedicated line tool', () => {
  const params = createInspectorCommandParams();
  const commands = buildToolCompactCommands(
    { ...params, highlightedTool: 'line', inspector: 'tool' } as never,
    {
      applyCropSelection: vi.fn(async () => undefined),
    }
  );

  expect(commands.map((command) => command.id)).toEqual([
    'line-width',
    'line-roughness',
    'line-bowing',
    'line-color',
    'line-opacity',
    'line-style',
    'line-corners',
    'line-fill',
    'line-shadow',
  ]);

  expectLineCommandChrome(commands);
  expectLineCommandStructuredControls(commands);

  const opacityCommand = commands.find((command) => command.id === 'line-opacity');
  const opacityControl = ((opacityCommand?.content as any).props.children as any).props;

  expect(opacityControl.value).toBe(100);
  expect(opacityControl.max).toBe(100);

  commitNumeric(opacityControl, 75);

  expect(params.previewLinePatch).toHaveBeenCalledWith({ opacity: 0.75 });
});

it('renders shape preset and stroke style through compact field controls', () => {
  const params = createInspectorCommandParams();
  const commands = buildShapeCompactCommands(params as never);
  const markup = renderToStaticMarkup(<>{commands.map((command) => command.content)}</>);

  expect(markup).toContain('shared.ui.compact-inspector.select-field');
  expect(markup).toContain('shared.ui.compact-inspector.segmented-field');
  expect(markup).toContain('shared.ui.compact-inspector.color-field');
  expect(markup).toContain('shared.ui.compact-inspector.numeric-row');
});

it('covers compact shape fallbacks for non-rectangle and transparent fill states', () => {
  const params = createInspectorCommandParams();
  params.highlightedTool = 'ellipse';
  params.inspectorToolSettings.ellipse = {
    ...params.inspectorToolSettings.ellipse,
    borderPresetId: 'missing-preset',
    fillOpacity: 0,
  };
  const commands = buildShapeCompactCommands(params as never);
  const fillCommand = commands.find((command) => command.id === 'shape-fill-color');

  expect(commands.map((command) => command.id)).not.toContain('shape-radius');
  expect(commands[0]?.value).toBe(translate('editor.compact.shapePresetFallback'));
  expect(renderToStaticMarkup(<>{fillCommand?.trigger}</>)).toContain(
    '--editor-tabler-color-icon-opacity:0'
  );
});

it('builds blur compact commands with area and frame controls', () => {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.blur = {
    amount: 11,
    blurType: 'distortion',
    showBorder: false,
  };
  const commands = buildBlurCompactCommands(params as never);
  expect(commands.map((command) => command.id)).toEqual([
    'blur-type',
    'blur-amount',
    'blur-radius',
    'blur-stroke-width',
    'blur-stroke-style',
    'blur-stroke-color',
    'blur-stroke-opacity',
  ]);
  commitNumeric(((commands[1]?.content as any).props.children as any).props, 15);
  ((commands[0]?.content as any).props.children as any).props.onChange('solid');
  commitNumeric(((commands[3]?.content as any).props.children as any).props, 6);

  expect(params.previewBlurPatch).toHaveBeenCalledWith({ amount: 15 });
  expect(params.previewBlurPatch).toHaveBeenCalledWith({ showBorder: true, strokeWidth: 6 });
});

function triggerBrushColorAndWidth(commands: ReturnType<typeof buildBrushCompactCommands>) {
  (((commands[0]?.content as any).props.children as any).props.onChange as (value: string) => void)(
    '#0088ff'
  );
  (
    ((commands[0]?.content as any).props.children as any).props.onPreviewReset as (
      value: string
    ) => void
  )('#1188ff');
  commitNumeric(((commands[1]?.content as any).props.children as any).props, 6);
}

function triggerBrushSmoothingAndOpacity(commands: ReturnType<typeof buildBrushCompactCommands>) {
  commands[2]?.onClick?.();
  commitNumeric(((commands[3]?.content as any).props.children as any).props, 40);
}

it('builds brush compact commands for both pencil and highlighter styles', () => {
  const params = createInspectorCommandParams();
  const pencilCommands = buildBrushCompactCommands(params as never, 'pencil');
  const highlighterCommands = buildBrushCompactCommands(params as never, 'highlighter');

  expect(pencilCommands.map((command) => command.icon)).toEqual([
    'color',
    'size',
    undefined,
    undefined,
    'opacity',
    'trajectory',
  ]);
  expect(pencilCommands.map((command) => command.id)).toContain('pencil-shadow');
  expect(highlighterCommands.map((command) => command.icon)).toEqual([
    'color',
    'size',
    undefined,
    'opacity',
  ]);
  expect(pencilCommands[0]?.title).toBe(translate('editor.compact.lineColor'));
  expect(pencilCommands[1]?.title).toBe(translate('editor.compact.lineWidth'));
  expect(pencilCommands[2]?.title).toBe(translate('editor.compact.dynamicWidth'));
  expect(pencilCommands[2]?.active).toBe(true);
  expect(pencilCommands[3]?.active).toBe(true);
  expect(((pencilCommands[0]?.content as any).props.children as any).props.onPreviewChange).toEqual(
    expect.any(Function)
  );

  triggerBrushColorAndWidth(pencilCommands);
  triggerBrushSmoothingAndOpacity(highlighterCommands);

  expect(params.updateColor).toHaveBeenCalledTimes(1);
  expect(params.previewColor).toHaveBeenCalledTimes(1);
  expect(params.previewBrushPatch).toHaveBeenCalledWith('pencil', { width: 6 });
  expect(params.applyBrushPatch).toHaveBeenCalledWith('highlighter', { smoothingLevel: 0 });
  expect(params.previewBrushPatch).toHaveBeenCalledWith('highlighter', { opacity: 0.4 });
  expect(params.commitPendingSelectionSettings).toHaveBeenCalledTimes(2);
});
