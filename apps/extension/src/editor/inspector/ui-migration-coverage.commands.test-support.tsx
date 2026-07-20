import { expect, it, vi } from 'vitest';

import { buildGridStyleCommands } from './compact/inspector/grid-style-sections';
import { buildBlurCompactCommands } from './compact/tool-commands/blur';
import { LineRange } from './compact/tool-commands/line-range';
import { buildLineCompactCommands } from './compact/tool-commands/line';
import {
  buildRasterBrushCompactCommands,
  buildRasterEraserCompactCommands,
  buildRasterSelectionCompactCommands,
} from './compact/tool-commands/raster';
import { buildShapeCompactCommands } from './compact/tool-commands/shape';
import { buildToolTemplateCommand } from './compact/tool-commands/template';
import { renderArrowControlsSection } from './tools/arrow-sections';
import { renderBrushControlsSection } from './tools/brush-shape-sections/brush';
import { renderShapeControlsSection } from './tools/brush-shape-sections/shape';
import { renderBlurControlsSection } from './tools/blur';
import { renderLineControlsSection } from './tools/line-sections';
import { renderLineFillSection } from './tools/line-sections/fill';
import { RasterBrushControlsSection, RasterEraserControlsSection } from './tools/raster';
import { RangeField, PercentRangeField } from './tools/rich-shape/fields';
import {
  ShadowAngleSection,
  ShadowBlurSection,
  ShadowDistanceSection,
  ShadowRangeSection,
} from './tools/shadow';
import { renderStepControlsSection } from './tools/step-sections';
import {
  renderTextBackgroundColorSection,
  renderTextBackgroundOpacityPanel,
  renderTextForegroundColorSection,
  renderTextOpacityPanel,
  renderTextShadowColorSection,
} from './tools/text-sections/colors';
import {
  buildTextAppearanceBackgroundCommand,
  buildTextAppearanceBackgroundOpacityCommand,
} from './tools/text-sections/commands/appearance/background';
import {
  buildTextAppearanceColorCommand,
  buildTextAppearanceOpacityCommand,
} from './tools/text-sections/commands/appearance/color';
import { renderTextSizeControl } from './tools/text-sections/size';
import { buildStepSizeCommand } from './tools/tool-inspector/session-sections/step/size';
import {
  createInspectorCommandParams,
  createToolsPanelProps,
} from '../../../../../tooling/test/harness/editor/ownership/fixtures';
import {
  createTemplateHeaderState,
  exerciseCommands,
  exerciseNode,
} from './ui-migration-coverage.test-support';
import { createUtilityCoverage } from './ui-migration-coverage.commands.utility.test-support';

function createCompactCommandParams() {
  const params = createInspectorCommandParams();
  (
    params as unknown as { toolPresetHeader: ReturnType<typeof createTemplateHeaderState> }
  ).toolPresetHeader = createTemplateHeaderState();
  return params;
}

function exerciseCompactCommands(params: ReturnType<typeof createInspectorCommandParams>) {
  const legacyBlurParams = {
    ...createInspectorCommandParams(),
    inspectorToolSettings: {
      ...params.inspectorToolSettings,
      blur: { amount: 12, blurType: 'solid', showBorder: true },
    },
  };
  const unselectedTemplateParams = {
    ...params,
    toolPresetHeader: {
      ...createTemplateHeaderState(),
      templates: createTemplateHeaderState().templates.map((template) => ({
        ...template,
        selected: false,
      })),
    },
  };
  const noGroupsTemplateParams = {
    ...params,
    toolPresetHeader: {
      ...createTemplateHeaderState(),
      groups: undefined,
    },
  };

  return exerciseCommands([
    ...buildGridStyleCommands(params as never),
    ...buildBlurCompactCommands(params as never),
    ...buildBlurCompactCommands(legacyBlurParams as never),
    ...buildLineCompactCommands(params as never),
    ...buildShapeCompactCommands(params as never),
    ...buildRasterSelectionCompactCommands({ clearRasterSelection: vi.fn() }),
    ...buildRasterEraserCompactCommands({ clearRasterSelection: vi.fn() }),
    ...buildRasterBrushCompactCommands({ clearRasterSelection: vi.fn() }),
    buildTextAppearanceColorCommand(params as never),
    buildTextAppearanceOpacityCommand(params as never),
    buildTextAppearanceBackgroundCommand(params as never),
    buildTextAppearanceBackgroundOpacityCommand(params as never),
    buildStepSizeCommand(params as never, params.inspectorToolSettings.step),
    buildToolTemplateCommand(params as never),
    buildToolTemplateCommand(unselectedTemplateParams as never),
    buildToolTemplateCommand(noGroupsTemplateParams as never),
  ]);
}

function exerciseLineRange(params: ReturnType<typeof createInspectorCommandParams>) {
  return exerciseNode(
    <LineRange
      label="Width"
      min={0}
      max={100}
      value={25}
      onChange={params.previewLinePatch as never}
      onValueCommit={params.commitPendingSelectionSettings}
    />
  );
}

it('routes compact command numeric controls through shared numeric rows', () => {
  const params = createCompactCommandParams();
  const commandIds = exerciseCompactCommands(params);
  expect(buildLineCompactCommands({ ...params, applyLinePatch: undefined } as never)).toEqual([]);

  const lineRangeMarkup = exerciseLineRange(params);

  expect(lineRangeMarkup).toContain('shared.ui.compact-inspector.numeric-row');
  expect(commandIds.length).toBeGreaterThan(0);
  expect(params.commitPendingSelectionSettings).toHaveBeenCalled();
});

function createToolSectionProps() {
  const props = createToolsPanelProps({
    toolPresetHeader: createTemplateHeaderState(),
  });
  const lineProps = (fillMode: 'color' | 'gradient' | 'rough') =>
    createToolsPanelProps({
      inspectorToolSettings: {
        ...props.inspectorToolSettings,
        line: { ...props.inspectorToolSettings.line, fillMode },
      },
    });
  const roughLineProps = lineProps('rough');
  const colorLineProps = lineProps('color');
  const gradientLineProps = lineProps('gradient');
  const sizedArrowProps = createToolsPanelProps({
    inspectorToolSettings: {
      ...props.inspectorToolSettings,
      arrow: {
        ...props.inspectorToolSettings.arrow,
        endHeadSize: 1.8,
        startHeadSize: 1.4,
      },
    },
  });
  const borderlessBlurProps = createToolsPanelProps({
    inspectorToolSettings: {
      ...props.inspectorToolSettings,
      blur: { ...props.inspectorToolSettings.blur, showBorder: false },
    },
  });
  return {
    borderlessBlurProps,
    colorLineProps,
    gradientLineProps,
    props,
    roughLineProps,
    sizedArrowProps,
  };
}

function createToolSectionNodes(args: ReturnType<typeof createToolSectionProps>) {
  return [
    ...createPrimaryToolSectionNodes(args),
    ...createToolRangeSectionNodes(),
    renderStepControlsSection(args.props as never),
    ...createTextToolSectionNodes(args.props),
  ];
}

function createPrimaryToolSectionNodes(args: ReturnType<typeof createToolSectionProps>) {
  const {
    borderlessBlurProps,
    colorLineProps,
    gradientLineProps,
    props,
    roughLineProps,
    sizedArrowProps,
  } = args;
  return [
    renderArrowControlsSection(props as never),
    renderArrowControlsSection(sizedArrowProps as never),
    renderBrushControlsSection('pencil', props as never),
    renderBrushControlsSection('highlighter', props as never),
    renderBlurControlsSection(props as never),
    renderBlurControlsSection(borderlessBlurProps as never),
    renderShapeControlsSection({ ...props, shapeTool: 'rectangle' } as never),
    renderShapeControlsSection({ ...props, shapeTool: 'ellipse' } as never),
    renderLineControlsSection(props as never),
    renderLineControlsSection(colorLineProps as never),
    renderLineControlsSection(roughLineProps as never),
    renderLineFillSection(colorLineProps as never, colorLineProps.inspectorToolSettings.line),
    renderLineFillSection(gradientLineProps as never, gradientLineProps.inspectorToolSettings.line),
    <RasterEraserControlsSection key="eraser" />,
    <RasterBrushControlsSection key="brush" />,
  ];
}

function createToolRangeSectionNodes() {
  return [
    <RangeField key="range-px" label="Size" value={8} valueLabel="8px" onChange={vi.fn()} />,
    <RangeField key="range-deg" label="Angle" value={45} valueLabel="45°" onChange={vi.fn()} />,
    <RangeField key="range-x" label="Scale" value={1.5} valueLabel="1.5x" onChange={vi.fn()} />,
    <PercentRangeField
      key="percent"
      label="Opacity"
      value={0.4}
      onChange={vi.fn()}
      valueKind="opacity"
    />,
    <ShadowRangeSection
      key="shadow"
      label="Shadow"
      value={20}
      onChange={vi.fn()}
      onValueCommit={vi.fn()}
    />,
    <ShadowAngleSection key="angle" value={90} onChange={vi.fn()} onValueCommit={vi.fn()} />,
    <ShadowDistanceSection key="distance" value={8} onChange={vi.fn()} onValueCommit={vi.fn()} />,
    <ShadowBlurSection key="blur" value={12} onChange={vi.fn()} onValueCommit={vi.fn()} />,
  ];
}

function createTextToolSectionNodes(props: ReturnType<typeof createToolsPanelProps>) {
  return [
    renderTextSizeControl(props as never, props.inspectorToolSettings.text.fontSize),
    renderTextOpacityPanel(props as never, props.inspectorToolSettings.text),
    renderTextBackgroundOpacityPanel(props as never, props.inspectorToolSettings.text),
    renderTextForegroundColorSection(props as never, props.inspectorToolSettings.text),
    renderTextBackgroundColorSection(props as never, props.inspectorToolSettings.text),
    renderTextShadowColorSection(props as never, props.inspectorToolSettings.text),
    renderTextShadowColorSection(props as never, {
      ...props.inspectorToolSettings.text,
      shadowColor: '#123456',
    }),
  ];
}

function exerciseTextOpacityBranches(props: ReturnType<typeof createToolsPanelProps>) {
  exerciseNode(renderTextOpacityPanel(props as never, props.inspectorToolSettings.text), 120);
  exerciseNode(
    renderTextBackgroundOpacityPanel(props as never, props.inspectorToolSettings.text),
    -10
  );
}

it('routes full inspector tool sections through shared numeric rows', () => {
  const sectionProps = createToolSectionProps();
  const nodes = createToolSectionNodes(sectionProps);

  const html = nodes.map((node) => exerciseNode(node)).join('');
  exerciseTextOpacityBranches(sectionProps.props);

  expect(html).toContain('shared.ui.compact-inspector.numeric-row');
  expect(sectionProps.props.commitPendingSelectionSettings).toHaveBeenCalled();
  expect(sectionProps.props.previewLinePatch).toHaveBeenCalled();
  expect(sectionProps.props.previewStepPatch).toHaveBeenCalled();
});

it('routes utility inspector panels through shared numeric rows and grouped presets', () => {
  const { html, layerClassName } = createUtilityCoverage();

  expect(html).toContain('shared.ui.compact-inspector.numeric-row');
  expect(layerClassName).toContain('rounded-[10px]');
});
