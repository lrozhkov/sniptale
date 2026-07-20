import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { renderBrushControlsSection } from './brush';

function getRequiredValue<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createBrushSectionProps() {
  return {
    applyBrushPatch: vi.fn(),
    commitPendingSelectionSettings: vi.fn(),
    inspectorToolSettings: {
      pencil: {
        color: '#111111',
        dynamicWidth: true,
        opacity: 0.6,
        shapeCorrection: 'subtle',
        shadow: 0,
        shadowAngle: 90,
        shadowColor: '#111111',
        smoothingLevel: 4,
        width: 12,
      },
      highlighter: {
        color: '#222222',
        dynamicWidth: false,
        opacity: 0.4,
        shapeCorrection: 'off',
        shadow: 30,
        shadowAngle: 90,
        shadowColor: '#222222',
        smoothingLevel: 5,
        width: 18,
      },
    },
    previewBrushPatch: vi.fn(),
    previewColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
    recentColors: ['#aaa'],
    shapeStrokePalette: ['#111111'],
    toNumber: (value: string, fallback?: number) => Number(value) || fallback || 0,
    updateColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
  };
}

function getBrushSections(section: React.ReactElement<any>) {
  const sections = React.Children.toArray(section.props.children) as React.ReactElement<any>[];

  return {
    sections,
    widthSection: getRequiredValue(sections[0], 'brush width section'),
    colorSection: getRequiredValue(sections[1], 'brush color section'),
    opacitySection: getRequiredValue(sections[2], 'brush opacity section'),
    smoothingSection: getRequiredValue(sections[3], 'brush smoothing section'),
  };
}

function getPencilGroups(section: React.ReactElement<any>) {
  const groups = React.Children.toArray(section.props.children) as React.ReactElement<any>[];
  const lineGroup = getRequiredValue(groups[0], 'pencil line group');
  const shadowGroup = getRequiredValue(groups[1], 'pencil shadow group');
  const lineSections = React.Children.toArray(
    lineGroup.props.children.props.children
  ) as React.ReactElement<any>[];
  const shadowSections = React.Children.toArray(
    shadowGroup.props.children.props.children
  ) as React.ReactElement<any>[];

  return {
    groups,
    lineGroup,
    shadowGroup,
    widthSection: getRequiredValue(lineSections[0], 'pencil width section'),
    lineColorSection: getRequiredValue(lineSections[1], 'pencil line color section'),
    dynamicWidthSection: getRequiredValue(lineSections[3], 'pencil dynamic width section'),
    smoothingSection: getRequiredValue(lineSections[4], 'pencil smoothing section'),
    shadowSizeSection: getRequiredValue(shadowSections[0], 'pencil shadow size section'),
    shadowColorSection: getRequiredValue(shadowSections[1], 'pencil shadow color section'),
    shadowDirectionSection: getRequiredValue(shadowSections[2], 'pencil shadow direction section'),
    shadowDistanceSection: getRequiredValue(shadowSections[3], 'pencil shadow distance section'),
    shadowBlurSection: getRequiredValue(shadowSections[4], 'pencil shadow blur section'),
  };
}

describe('renderBrushControlsSection highlighter controls', () => {
  it('uses the brush palette and update handlers', () => {
    const props = createBrushSectionProps();

    const section = renderBrushControlsSection('highlighter', props as never);
    const { colorSection, opacitySection, sections, smoothingSection, widthSection } =
      getBrushSections(section);

    expect(sections).toHaveLength(4);
    expect(colorSection.props.palette).toBeDefined();
    colorSection.props.onChange('#333333');
    colorSection.props.onPreviewChange('#444444');
    colorSection.props.onPreviewReset('#555555');
    expect(widthSection.props.max).toBe(48);
    expect(smoothingSection.props.value).toBe('editor.compact.enabledShort');
    expect(opacitySection.props.step).toBe(5);
    widthSection.props.onPreviewValue(20);
    widthSection.props.onCommitValue(20);
    opacitySection.props.onPreviewValue(50);
    opacitySection.props.onCommitValue(50);
    smoothingSection.props.onToggle();

    expect(props.previewBrushPatch).toHaveBeenCalledWith('highlighter', { width: 20 });
    expect(props.applyBrushPatch).toHaveBeenCalledWith('highlighter', {
      color: '#333333',
      shadowColor: '#333333',
    });
    expect(props.applyBrushPatch).toHaveBeenCalledWith('highlighter', {
      color: '#444444',
      shadowColor: '#444444',
    });
    expect(props.applyBrushPatch).toHaveBeenCalledWith('highlighter', {
      color: '#555555',
      shadowColor: '#555555',
    });
    expect(props.applyBrushPatch).toHaveBeenCalledWith('highlighter', { smoothingLevel: 0 });
    expect(props.previewBrushPatch).toHaveBeenCalledWith('highlighter', { opacity: 0.5 });
    expect(props.previewBrushPatch).not.toHaveBeenCalledWith('highlighter', { shadow: 100 });
    expect(props.commitPendingSelectionSettings).toHaveBeenCalledTimes(2);
  });
});

describe('renderBrushControlsSection pencil layout', () => {
  it('uses the pencil width ceiling for the pencil tool', () => {
    const props = createBrushSectionProps();
    props.inspectorToolSettings.highlighter.shadow = 0;
    props.inspectorToolSettings.highlighter.smoothingLevel = 4;

    const section = renderBrushControlsSection('pencil', props as never);
    const { groups, lineGroup, shadowGroup, widthSection } = getPencilGroups(section);

    expect(groups).toHaveLength(2);
    expect(lineGroup.props.label).toBe('editor.compact.lineGroup');
    expect(shadowGroup.props.label).toBe('highlighter.editor.shadowLabel');
    expect(widthSection.props.max).toBe(20);
  });
});

describe('renderBrushControlsSection pencil toggles', () => {
  it('renders pencil grouped toggles and routes updates through brush patching', () => {
    const props = createBrushSectionProps();

    const section = renderBrushControlsSection('pencil', props as never);
    const { dynamicWidthSection, smoothingSection } = getPencilGroups(section);

    dynamicWidthSection.props.onToggle();
    smoothingSection.props.onToggle();

    expect(props.applyBrushPatch).toHaveBeenCalledWith('pencil', { dynamicWidth: false });
    expect(props.applyBrushPatch).toHaveBeenCalledWith('pencil', { smoothingLevel: 0 });
  });
});

describe('renderBrushControlsSection pencil shadow controls', () => {
  it('renders pencil shadow color and direction controls', () => {
    const props = createBrushSectionProps();

    const section = renderBrushControlsSection('pencil', props as never);
    const {
      shadowBlurSection,
      shadowColorSection,
      shadowDirectionSection,
      shadowDistanceSection,
      shadowSizeSection,
    } = getPencilGroups(section);

    expect(shadowSizeSection.props.label).toBe('editor.compact.shadowSize');
    expect(shadowColorSection.props.value).toBe('#111111');
    shadowDirectionSection.props.onChange(135);
    shadowDirectionSection.props.onValueCommit();
    shadowDistanceSection.props.onChange(8);
    shadowBlurSection.props.onChange(16);

    expect(props.previewBrushPatch).toHaveBeenCalledWith('pencil', { shadowAngle: 135 });
    expect(props.previewBrushPatch).toHaveBeenCalledWith('pencil', { shadowDistance: 8 });
    expect(props.previewBrushPatch).toHaveBeenCalledWith('pencil', { shadowBlur: 16 });
    expect(props.commitPendingSelectionSettings).toHaveBeenCalledOnce();
  });
});

describe('renderBrushControlsSection pencil color fallback', () => {
  it('falls back pencil shadow color to the line color before customization', () => {
    const props = createBrushSectionProps();
    props.inspectorToolSettings.pencil.dynamicWidth = false;
    props.inspectorToolSettings.pencil.smoothingLevel = 0;
    delete (props.inspectorToolSettings.pencil as { shadowColor?: string }).shadowColor;

    const section = renderBrushControlsSection('pencil', props as never);
    const { dynamicWidthSection, lineColorSection, shadowColorSection, smoothingSection } =
      getPencilGroups(section);

    expect(dynamicWidthSection.props.active).toBe(false);
    lineColorSection.props.onChange('#666666');
    lineColorSection.props.onPreviewChange('#777777');
    lineColorSection.props.onPreviewReset('#888888');
    expect(smoothingSection.props.active).toBe(false);
    expect(shadowColorSection.props.value).toBe('#111111');
    expect(props.applyBrushPatch).toHaveBeenCalledWith('pencil', { color: '#666666' });
    expect(props.applyBrushPatch).toHaveBeenCalledWith('pencil', { color: '#777777' });
    expect(props.applyBrushPatch).toHaveBeenCalledWith('pencil', { color: '#888888' });
  });
});

describe('renderBrushControlsSection preset wrapper', () => {
  it('renders brush controls inside the template parameter wrapper', () => {
    const props = {
      ...createBrushSectionProps(),
      toolPresetHeader: {
        activeView: 'parameters' as const,
        saveDisabled: true,
        savePanel: null,
        templates: [],
        onOpenSavePanel: vi.fn(),
        onViewChange: vi.fn(),
      },
    };

    expect(
      renderToStaticMarkup(renderBrushControlsSection('highlighter', props as never))
    ).toContain('data-editor-template-save-trigger');
  });
});
