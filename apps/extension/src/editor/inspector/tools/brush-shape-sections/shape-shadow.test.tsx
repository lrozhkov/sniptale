import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import * as shapeConstants from '../../../../features/editor/document/constants';
import { renderShapeControlsSection } from './shape';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function getRequiredValue<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function flattenElements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap((item) => {
    if (
      React.isValidElement<{ children?: React.ReactNode }>(item) &&
      item.type === React.Fragment
    ) {
      return flattenElements(item.props.children);
    }

    return React.isValidElement(item) ? [item] : [];
  });
}

function createProps() {
  return {
    applyPreset: vi.fn(),
    applyShapePatch: vi.fn(),
    borderPresetOptions: [],
    commitPendingSelectionSettings: vi.fn(),
    inspectorToolSettings: {
      rectangle: {
        borderPresetId: null,
        customCss: '',
        fillColor: '#ffffff',
        fillOpacity: 0,
        inheritCustomCss: false,
        opacity: 1,
        radius: 0,
        shadow: 25,
        strokeColor: '#f97316',
        strokeOpacity: 1,
        strokeStyle: 'solid',
        strokeWidth: 4,
      },
    },
    previewShapePatch: vi.fn(),
    previewColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
    recentColors: [],
    saveShapeAsHighlighterPreset: vi.fn(),
    shapeFillPalette: shapeConstants.EDITOR_TOOL_SHAPE_FILL_PALETTE,
    shapeStrokePalette: shapeConstants.EDITOR_TOOL_SHAPE_STROKE_PALETTE,
    shapeTool: 'rectangle' as const,
    toNumber: (value: string, fallback?: number) => Number(value) || fallback || 0,
    updateColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
  };
}

describe('shape shadow controls', () => {
  it('routes canonical shadow color, angle, distance and blur patches', () => {
    const props = createProps();
    const section = renderShapeControlsSection(props as never);
    const sections = React.Children.toArray(section.props.children) as React.ReactElement<any>[];
    const shadowSection = getRequiredValue(
      sections.find((item) => item.props.label === 'highlighter.editor.shadowLabel'),
      'shape shadow section'
    );
    const controls = flattenElements(shadowSection.props.children.props.children);
    const colorSection = getRequiredValue(controls[1], 'shape shadow color section');
    const angleSection = getRequiredValue(controls[2], 'shape shadow angle section');
    const distanceSection = getRequiredValue(controls[3], 'shape shadow distance section');
    const blurSection = getRequiredValue(controls[4], 'shape shadow blur section');

    expect(colorSection.props.value).toBe('#f97316');
    colorSection.props.onChange('#111111');
    colorSection.props.onPreviewChange('#222222');
    angleSection.props.onChange(180);
    distanceSection.props.onChange(9);
    blurSection.props.onChange(18);

    expect(props.applyShapePatch).toHaveBeenCalledWith({ shadowColor: '#111111' });
    expect(props.applyShapePatch).toHaveBeenCalledWith({ shadowColor: '#222222' });
    expect(props.previewShapePatch).toHaveBeenCalledWith({ shadowAngle: 180 });
    expect(props.previewShapePatch).toHaveBeenCalledWith({ shadowDistance: 9 });
    expect(props.previewShapePatch).toHaveBeenCalledWith({ shadowBlur: 18 });
    expect(props.commitPendingSelectionSettings).not.toHaveBeenCalled();
  });

  it('uses explicit shadow color before falling back to stroke color', () => {
    const props = createProps();
    (props.inspectorToolSettings.rectangle as { shadowColor?: string }).shadowColor = '#123456';

    const section = renderShapeControlsSection(props as never);
    const sections = React.Children.toArray(section.props.children) as React.ReactElement<any>[];
    const shadowSection = getRequiredValue(
      sections.find((item) => item.props.label === 'highlighter.editor.shadowLabel'),
      'shape shadow section'
    );
    const controls = flattenElements(shadowSection.props.children.props.children);

    expect(controls[1]?.props.value).toBe('#123456');
  });
});
