import { renderToStaticMarkup } from 'react-dom/server';
import type React from 'react';
import { expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildLineCompactCommands } from './line';
import {
  expectLineCornerGlyphs,
  expectLineFillGlyphs,
  expectLineStyleGlyphs,
  expectShapeStrokeGlyphs,
} from './line-components-glyphs.test-support';
import { LineRange } from './line-range';

function createLineParams(fillMode: 'color' | 'gradient' | 'none' | 'rough' = 'none') {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.line = {
    ...params.inspectorToolSettings.line,
    fillMode,
    shadow: 24,
  };
  return params;
}

function renderLineFill(fillMode: 'color' | 'gradient' | 'none' | 'rough') {
  const params = createLineParams(fillMode);
  const command = buildLineCompactCommands(params as never).find(({ id }) => id === 'line-fill');
  return renderToStaticMarkup(<>{command?.content}</>);
}

function previewNumeric(control: { onPreviewValue?: (value: number) => void }, value: number) {
  control.onPreviewValue?.(value);
}

function commitNumeric(
  control: { onCommitValue?: (value: number) => void; onPreviewValue?: (value: number) => void },
  value: number
) {
  control.onPreviewValue?.(value);
  control.onCommitValue?.(value);
}

function renderLineRangeControl(range: React.ReactElement) {
  if (range.type === LineRange) {
    return (range.type as any)(range.props) as React.ReactElement<any>;
  }
  const rendered = (range.type as any)(range.props) as React.ReactElement<{
    children: React.ReactElement;
  }>;
  const lineRange = rendered.type === LineRange ? rendered : rendered.props.children;
  return (lineRange.type as any)(lineRange.props) as React.ReactElement<any>;
}

function findLineFillCommand(params: ReturnType<typeof createLineParams>) {
  return buildLineCompactCommands(params as never).find((command) => command.id === 'line-fill');
}

function getLineFillBody(params: ReturnType<typeof createLineParams>) {
  const fillContent = (findLineFillCommand(params)?.content as any).props.children;
  return fillContent.type(fillContent.props);
}

function findLineFillBranch(body: React.ReactElement, name: string) {
  const children = (body.props as { children: Array<React.ReactElement | null> }).children;
  return children.find(
    (child: React.ReactElement | null) => (child?.type as { name?: string })?.name === name
  );
}

function runGradientFillCallbacks(params: ReturnType<typeof createLineParams>) {
  const gradientBody = getLineFillBody(params);
  const gradientContent = findLineFillBranch(gradientBody, 'GradientFillContent');
  if (!gradientContent || typeof gradientContent.type !== 'function') {
    throw new Error('Gradient fill content was not rendered');
  }
  const gradientControls = (gradientContent.type as any)(gradientContent.props).props.children;
  gradientControls[0].props.onStopsChange([
    { color: '#111111', offset: 0 },
    { color: '#222222', offset: 1 },
  ]);
  gradientControls[0].props.onPreviewStopsChange([
    { color: '#333333', offset: 0 },
    { color: '#444444', offset: 1 },
  ]);
  gradientControls[0].props.onAngleChange(135);
  gradientControls[0].props.onAngleCommit();
}

function runRoughFillCallbacks(params: ReturnType<typeof createLineParams>) {
  const roughBody = getLineFillBody(params);
  const roughContent = findLineFillBranch(roughBody, 'RoughFillContent');
  if (!roughContent || typeof roughContent.type !== 'function') {
    throw new Error('Rough fill content was not rendered');
  }
  const roughSections = (roughContent.type as any)(roughContent.props).props.children;
  const roughBase = roughSections[0].type(roughSections[0].props).props.children;
  roughBase[0].props.createPatch('#333333');
  roughBase[1].props.onChange('zigzag');
  previewRoughRangeGroup(roughSections[1], [5, 2, 3]);
  previewRoughRangeGroup(roughSections[2], [18, 45, 55]);
}

function previewRoughRangeGroup(section: React.ReactElement, values: number[]) {
  const ranges = (section.type as any)(section.props).props.children;
  values.forEach((value, index) =>
    previewNumeric(renderLineRangeControl(ranges[index]).props, value)
  );
}

function runShadowCallbacks(params: ReturnType<typeof createLineParams>) {
  const shadowCommand = buildLineCompactCommands(params as never).find(
    (command) => command.id === 'line-shadow'
  );
  const shadowBody = (shadowCommand?.content as any).type((shadowCommand?.content as any).props);
  const shadowControls = shadowBody.props.children.props.children;
  const shadowColor = shadowControls[1].type(shadowControls[1].props);
  shadowColor.props.onChange('#444444');
  shadowColor.props.onPreviewChange('#555555');
  shadowColor.props.onPreviewReset('#666666');
  shadowControls.slice(2).forEach((range: React.ReactElement, index: number) => {
    const rendered = (range.type as any)(range.props) as React.ReactElement<any>;
    commitNumeric(rendered.props, 20 + index);
  });
}

it('renders every line fill mode without falling back to old inspector chrome', () => {
  expect(renderLineFill('none')).toContain('shared.ui.compact-inspector.select-field');
  expect(renderLineFill('color')).toContain('input');
  expect(renderLineFill('gradient')).toContain('input');
  expect(renderLineFill('rough')).toContain('select');
});

it('routes line ranges, fill, style, corners, and shadow through existing handlers', () => {
  const params = createLineParams('rough');
  const commands = buildLineCompactCommands(params as never);
  const width = (commands[0]?.content as any).props.children.props;
  const roughness = (commands[1]?.content as any).props.children.props;
  const bowing = (commands[2]?.content as any).props.children.props;
  const style = (commands[5]?.content as any).props.children.props;
  const corners = (commands[6]?.content as any).props.children.props;
  const fillMarkup = renderToStaticMarkup(<>{commands[7]?.content}</>);
  const shadowMarkup = renderToStaticMarkup(<>{commands[8]?.content}</>);

  commitNumeric(width, 12);
  previewNumeric(roughness, 1.5);
  previewNumeric(bowing, 2);
  style.onChange('dash');
  corners.onChange('round');

  expect(params.previewLinePatch).toHaveBeenCalledWith({ width: 12 });
  expect(params.previewLinePatch).toHaveBeenCalledWith({ roughness: 1.5 });
  expect(params.previewLinePatch).toHaveBeenCalledWith({ bowing: 2 });
  expect(params.applyLinePatch).toHaveBeenCalledWith({ style: 'dash' });
  expect(params.applyLinePatch).toHaveBeenCalledWith({ corners: 'round' });
  expect(fillMarkup).toContain('Sketch');
  expect(shadowMarkup).toContain('input');
});

it('executes nested line fill and shadow popover callbacks', () => {
  const params = createLineParams('rough');
  const commands = buildLineCompactCommands(params as never);
  const fillCommand = commands.find((command) => command.id === 'line-fill');
  const fillContent = (fillCommand?.content as any).props.children;
  const fillBody = fillContent.type(fillContent.props);
  const fillModeSelector = fillBody.props.children[0];
  fillModeSelector.props.onChange('gradient');

  const roughContent = fillBody.props.children.find(
    (child: React.ReactElement | null) =>
      typeof child?.type === 'function' && child.type.name === 'RoughFillContent'
  );
  const roughBody = roughContent.type(roughContent.props);
  expect(renderToStaticMarkup(<>{roughBody}</>)).toContain('Hachure');

  const shadowCommand = commands.find((command) => command.id === 'line-shadow');
  const shadowBody = (shadowCommand?.content as any).type((shadowCommand?.content as any).props);
  const shadowRange = shadowBody.props.children.props.children[0];
  const renderedRange = shadowRange.type(shadowRange.props);
  params.inspectorToolSettings.line.fillMode = 'color';
  params.inspectorToolSettings.line.fillOpacity = 0.4;
  const visibleFill = buildLineCompactCommands(params as never).find(
    (command) => command.id === 'line-fill'
  );
  commitNumeric(renderedRange.props, 44);

  expect(params.applyLinePatch).toHaveBeenCalledWith({ fillMode: 'gradient' });
  expect(renderToStaticMarkup(<>{visibleFill?.trigger}</>)).toContain('opacity:0.4');
  expect(params.previewLinePatch).toHaveBeenCalledWith({ shadow: 44 });
  expect(params.commitPendingSelectionSettings).toHaveBeenCalled();
});

it('routes gradient, rough fill, and shadow subcontrols through compact callbacks', () => {
  const gradientParams = createLineParams('gradient');
  const roughParams = createLineParams('rough');

  runGradientFillCallbacks(gradientParams);
  runRoughFillCallbacks(roughParams);
  runShadowCallbacks(roughParams);

  expect(gradientParams.applyLinePatch).toHaveBeenCalledWith(
    expect.objectContaining({ gradientFrom: '#111111', gradientTo: '#222222' })
  );
  expect(gradientParams.previewLinePatch).toHaveBeenCalledWith(
    expect.objectContaining({ gradientFrom: '#333333', gradientTo: '#444444' })
  );
  expect(gradientParams.previewLinePatch).toHaveBeenCalledWith({ gradientAngle: 135 });
  expect(gradientParams.commitPendingSelectionSettings).toHaveBeenCalled();
  expect(roughParams.applyLinePatch).toHaveBeenCalledWith({ roughFillStyle: 'zigzag' });
  expect(roughParams.previewLinePatch).toHaveBeenCalledWith({ roughFillWeight: 5 });
  expect(roughParams.previewLinePatch).toHaveBeenCalledWith({ roughFillOpacity: 0.55 });
  expect(roughParams.previewLinePatch).toHaveBeenCalledWith({ shadowAngle: 20 });
  expect(roughParams.previewLinePatch).toHaveBeenCalledWith({ shadowDistance: 21 });
  expect(roughParams.previewLinePatch).toHaveBeenCalledWith({ shadowBlur: 22 });
});

it('renders line and shape option glyph branches', () => {
  const onChange = vi.fn();

  expectLineStyleGlyphs(onChange);
  expectLineCornerGlyphs(onChange);
  expectLineFillGlyphs(onChange);
  expectShapeStrokeGlyphs(onChange);
});

it('routes standalone line range events through compact range props', () => {
  const onChange = vi.fn();
  const onValueCommit = vi.fn();
  const element = LineRange({
    label: 'Line width',
    max: 10,
    min: 1,
    onChange,
    onValueCommit,
    step: 0.5,
    value: 4,
  }) as React.ReactElement<any>;

  element.props.onPreviewValue(7.5);
  element.props.onCommitValue(7.5);

  expect(element.props.step).toBe(0.5);
  expect(onChange).toHaveBeenCalledWith(7.5);
  expect(onValueCommit).toHaveBeenCalledOnce();
});
