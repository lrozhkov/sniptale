import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import * as shapeConstants from '../../../../features/editor/document/constants';
import { renderShapeControlsSection } from './shape';
import { getShapePresetValue } from './shared';
function getRequiredValue<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}
function createShapeControlsTestProps(
  applyShapePatch: ReturnType<typeof vi.fn>,
  shapeTool: 'rectangle' | 'ellipse' | 'diamond' = 'rectangle'
) {
  return {
    applyPreset: vi.fn(),
    applyShapePatch,
    borderPresetOptions: [{ label: 'Preset', value: 'preset-1' }],
    commitPendingSelectionSettings: vi.fn(),
    inspectorToolSettings: {
      ellipse: {
        borderPresetId: 'preset-1',
        customCss: '',
        fillColor: '#333333',
        fillOpacity: 0.2,
        inheritCustomCss: false,
        opacity: 0.7,
        radius: 0,
        shadow: 0,
        strokeColor: '#444444',
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
        strokeWidth: 5,
      },
      rectangle: {
        borderPresetId: 'preset-1',
        customCss: '',
        fillColor: '#333333',
        fillOpacity: 0.2,
        inheritCustomCss: false,
        opacity: 0.7,
        radius: 0,
        shadow: 0,
        strokeColor: '#444444',
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
        strokeWidth: 5,
      },
    },
    previewShapePatch: vi.fn(),
    previewColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
    recentColors: ['#aaa'],
    saveShapeAsHighlighterPreset: vi.fn(),
    shapeFillPalette: shapeConstants.EDITOR_TOOL_SHAPE_FILL_PALETTE,
    shapeStrokePalette: shapeConstants.EDITOR_TOOL_SHAPE_STROKE_PALETTE,
    shapeTool,
    toNumber: (value: string, fallback?: number) => Number(value) || fallback || 0,
    updateColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
  };
}
function getShapeRenderedSections(props: ReturnType<typeof createShapeControlsTestProps>) {
  const section = renderShapeControlsSection(props as never);
  const sections = React.Children.toArray(section.props.children) as React.ReactElement<any>[];
  const colorGrid = getRequiredValue(
    sections.find((item) => {
      const children = React.Children.toArray(item.props.children) as React.ReactElement<any>[];
      return children.some((child) => child.props.label === 'editor.compact.strokeColor');
    }),
    'shape color grid'
  );
  const colorSections = React.Children.toArray(
    colorGrid.props.children
  ) as React.ReactElement<any>[];
  const opacityGrid = getRequiredValue(
    sections.find((item) => {
      const children = React.Children.toArray(item.props.children) as React.ReactElement<any>[];
      return children.some(
        (child) => child.props.label === 'highlighter.editor.strokeOpacityLabel'
      );
    }),
    'shape opacity grid'
  );

  return {
    colorGrid,
    fillSection: getRequiredValue(colorSections[1], 'shape fill section'),
    opacityGrid,
    shadowSection: getRequiredValue(
      findSectionByLabel(sections, 'highlighter.editor.shadowLabel'),
      'shape shadow section'
    ),
    styleSection: getRequiredValue(
      findSectionByLabel(sections, 'highlighter.editor.styleLabel'),
      'shape style section'
    ),
    strokeSection: getRequiredValue(colorSections[0], 'shape stroke section'),
    widthSection: getRequiredValue(
      findSectionByLabel(sections, 'editor.compact.strokeWidth'),
      'shape width section'
    ),
    allSections: sections,
  };
}
function triggerShapeSectionUpdates(args: {
  applyShapePatch: ReturnType<typeof vi.fn>;
  fillSection: React.ReactElement<any>;
  shadowSection: React.ReactElement<any>;
  styleSection: React.ReactElement<any>;
  strokeOpacitySection: React.ReactElement<any>;
  strokeSection: React.ReactElement<any>;
  fillOpacitySection: React.ReactElement<any>;
  widthSection: React.ReactElement<any>;
}) {
  args.strokeSection.props.onChange('#555555');
  args.fillSection.props.onChange('#666666');
  args.widthSection.props.onPreviewValue(8);
  args.widthSection.props.onCommitValue(8);
  args.styleSection.props.onChange('dashed');
  const shadowControls = React.Children.toArray(
    args.shadowSection.props.children.props.children
  ) as React.ReactElement<any>[];
  const shadowSizeSection = getRequiredValue(shadowControls[0], 'shape shadow size section');
  shadowSizeSection.props.onChange(100);
  shadowSizeSection.props.onValueCommit();
  args.strokeOpacitySection.props.onPreviewValue(90);
  args.strokeOpacitySection.props.onCommitValue(90);
  args.fillOpacitySection.props.onPreviewValue(35);
  args.fillOpacitySection.props.onCommitValue(35);

  expect(args.applyShapePatch).toHaveBeenCalledWith({ strokeColor: '#555555' });
  expect(args.applyShapePatch).toHaveBeenCalledWith({ fillColor: '#666666' });
  expect(args.widthSection.props.onCommitValue).toBeTypeOf('function');
  expect(args.applyShapePatch).toHaveBeenCalledWith({ strokeStyle: 'dashed' });
  expect(shadowSizeSection.props.onValueCommit).toBeTypeOf('function');
  expect(args.strokeSection.props.onPreviewChange).toBeTypeOf('function');
  expect(args.applyShapePatch).not.toHaveBeenCalledWith({ opacity: expect.any(Number) });
}
function expectShapePreviewCommits(props: ReturnType<typeof createShapeControlsTestProps>) {
  expect(props.previewShapePatch).toHaveBeenCalledWith({ strokeWidth: 8 });
  expect(props.previewShapePatch).toHaveBeenCalledWith({ shadow: 100 });
  expect(props.previewShapePatch).toHaveBeenCalledWith({ strokeOpacity: 0.9 });
  expect(props.previewShapePatch).toHaveBeenCalledWith({ fillOpacity: 0.35 });
  expect(props.commitPendingSelectionSettings).toHaveBeenCalledTimes(4);
}

function hasSectionLabel(sections: React.ReactElement<any>[], label: string) {
  return sections.some((section) => section.props.label === label);
}

function findSectionByLabel(sections: React.ReactElement<any>[], label: string) {
  return sections.find((section) => section.props.label === label);
}

function hasCustomCssBoundaryHint(sections: React.ReactElement<any>[]) {
  return sections.some((section) => {
    if (section.props.label !== 'highlighter.editor.customCssLabel') {
      return false;
    }

    return React.Children.toArray(section.props.children).some((child) => {
      if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
        return false;
      }

      return child.props.children === 'editor.compact.shapeCustomCssBoundaryHint';
    });
  });
}

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

describe('renderShapeControlsSection', () => {
  it('uses stroke and fill palettes and applies patches', () => {
    const applyShapePatch = vi.fn();
    const props = createShapeControlsTestProps(applyShapePatch);
    const {
      allSections,
      colorGrid,
      fillSection,
      opacityGrid,
      shadowSection,
      styleSection,
      strokeSection,
      widthSection,
    } = getShapeRenderedSections(props);
    const opacitySections = React.Children.toArray(
      opacityGrid.props.children
    ) as React.ReactElement<any>[];
    const strokeOpacitySection = getRequiredValue(opacitySections[0], 'stroke opacity section');
    const fillOpacitySection = getRequiredValue(opacitySections[1], 'fill opacity section');

    expectShapeSectionStructure({
      allSections,
      colorGrid,
      fillOpacitySection,
      fillSection,
      opacityGrid,
      strokeOpacitySection,
      strokeSection,
      styleSection,
    });
    triggerShapeSectionUpdates({
      applyShapePatch,
      fillOpacitySection,
      fillSection,
      shadowSection,
      styleSection,
      strokeOpacitySection,
      strokeSection,
      widthSection,
    });
    expectShapePreviewCommits(props);
  });
});

describe('renderShapeControlsSection opacity and templates', () => {
  it('does not expose the legacy generic shape opacity section', () => {
    const props = createShapeControlsTestProps(vi.fn());
    const { allSections } = getShapeRenderedSections(props);

    expect(allSections.some((section) => section.props.label === 'editor.compact.opacity')).toBe(
      false
    );
  });

  it('renders shape controls inside the template parameter wrapper', () => {
    const props = {
      ...createShapeControlsTestProps(vi.fn()),
      presetHeader: {
        activeView: 'parameters' as const,
        saveDisabled: true,
        savePanel: null,
        templates: [],
        onOpenSavePanel: vi.fn(),
        onViewChange: vi.fn(),
      },
    };

    expect(renderToStaticMarkup(renderShapeControlsSection(props as never))).toContain(
      'data-editor-template-save-trigger'
    );
  });
});

describe('shape preset and shape-specific controls', () => {
  it('keeps the radius control rectangle-only', () => {
    const rectangleProps = createShapeControlsTestProps(vi.fn(), 'rectangle');
    const ellipsePatch = vi.fn();
    const ellipseProps = createShapeControlsTestProps(ellipsePatch, 'ellipse');
    const rectangleSections = getShapeRenderedSections(rectangleProps).allSections;
    const ellipseSections = getShapeRenderedSections(ellipseProps).allSections;
    const ellipseRadiusSection = findSectionByLabel(
      ellipseSections,
      'highlighter.editor.radiusLabel'
    );

    ellipseRadiusSection?.props.onPreviewValue(18);

    expect(hasSectionLabel(rectangleSections, 'highlighter.editor.radiusLabel')).toBe(true);
    expect(hasSectionLabel(ellipseSections, 'highlighter.editor.radiusLabel')).toBe(false);
    expect(ellipsePatch).not.toHaveBeenCalledWith({ radius: 18 });
  });

  it('maps empty and selected preset ids for the select value', () => {
    expect(getShapePresetValue({ borderPresetId: 'preset-1' })).toBe('preset-1');
    expect(getShapePresetValue({ borderPresetId: null })).toBe('');
  });
});

function expectShapeSectionStructure(args: {
  allSections: React.ReactElement<any>[];
  colorGrid: React.ReactElement<any>;
  fillOpacitySection: React.ReactElement<any>;
  fillSection: React.ReactElement<any>;
  opacityGrid: React.ReactElement<any>;
  strokeOpacitySection: React.ReactElement<any>;
  strokeSection: React.ReactElement<any>;
  styleSection: React.ReactElement<any>;
}) {
  expect(args.colorGrid.props.className).toBe('space-y-3');
  expect(args.opacityGrid.props.className).toBe('space-y-3');
  expect(args.strokeSection.props.label).toBe('editor.compact.strokeColor');
  expect(args.fillSection.props.label).toBe('editor.compact.fillColor');
  expect(args.styleSection.props.label).toBe('highlighter.editor.styleLabel');
  expect((args.styleSection.type as { name?: string }).name).toBe('SelectField');
  expect(args.strokeOpacitySection.props.label).toBe('highlighter.editor.strokeOpacityLabel');
  expect(args.fillOpacitySection.props.label).toBe('highlighter.editor.fillOpacityLabel');
  expect(args.strokeSection.props.title).toBe('editor.compact.strokeColor');
  expect(args.fillSection.props.title).toBe('editor.compact.fillColor');
  expect(args.strokeSection.props.palette).toBe(shapeConstants.EDITOR_TOOL_SHAPE_STROKE_PALETTE);
  expect(args.fillSection.props.palette).toBe(shapeConstants.EDITOR_TOOL_SHAPE_FILL_PALETTE);
  expect(args.strokeSection.props.onPreviewChange).toEqual(expect.any(Function));
  expect(args.fillSection.props.onPreviewReset).toEqual(expect.any(Function));
  expect(hasCustomCssBoundaryHint(args.allSections)).toBe(false);
}
