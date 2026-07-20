import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BlurSettings } from '../../../features/highlighter/contracts';

vi.mock('../presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presets')>()),
  EditorInspectorPresetHeader: (props: React.PropsWithChildren) => (
    <div>preset-header{props.children}</div>
  ),
}));

import { renderBlurControlsSection } from './blur';

type SectionElement = React.ReactElement<{
  children?: React.ReactNode;
  label?: string;
  onChange?: (value: number) => void;
  value?: string;
}>;

type ControlElement = React.ReactElement<{
  onChange?: (value: unknown) => void;
  onCommitValue?: (value: number) => void;
  onPreviewValue?: (value: number) => void;
  onPreviewChange?: (value: string) => void;
  onPreviewReset?: (value: string) => void;
  onValueCommit?: () => void;
}>;

function createProps(showBorder: boolean, toolPresetHeader: object | null) {
  const blur: BlurSettings = {
    amount: 12,
    blurType: 'solid',
    radius: 8,
    shadow: 30,
    showBorder,
    strokeColor: '#112233',
    strokeOpacity: 0.6,
    strokeStyle: 'dashed',
    strokeWidth: 5,
  };

  return {
    applyBlurPatch: vi.fn(),
    blurTypeOptions: [
      { label: 'Gaussian', value: 'gaussian' as const },
      { label: 'Solid', value: 'solid' as const },
    ],
    commitPendingSelectionSettings: vi.fn(),
    inspectorToolSettings: {
      blur,
    },
    lineStyleOptions: [
      { label: 'Сплошная', value: 'solid' as const },
      { label: 'Пунктир', value: 'dash' as const },
      { label: 'Точки', value: 'dot' as const },
      { label: 'Штрих-пунктир', value: 'dash-dot' as const },
      { label: 'Длинный пунктир', value: 'long-dash' as const },
    ],
    previewColor: vi.fn((setter: (next: string) => void, color: string) => setter(color)),
    previewBlurPatch: vi.fn(),
    recentColors: [],
    shapeStrokePalette: ['#112233'],
    toNumber: (value: string, fallback = 0) => {
      const next = Number(value);
      return Number.isFinite(next) ? next : fallback;
    },
    toolPresetHeader,
    updateColor: vi.fn((setter: (next: string) => void, color: string) => setter(color)),
  };
}

function getSections(showBorder = true) {
  const props = createProps(showBorder, null);
  const view = renderBlurControlsSection(props as never);
  const groups = React.Children.toArray(view.props.children) as SectionElement[];
  return {
    groups,
    props,
    sections: groups.flatMap((group) => getBlurGroupSections(group)),
  };
}

function getBlurGroupSections(group: SectionElement) {
  return React.Children.toArray(
    (group.props.children as React.ReactElement<{ children: React.ReactNode }>).props.children
  ) as SectionElement[];
}

function findSection(sections: SectionElement[], label: string) {
  return sections.find((section) => section.props.label === label);
}

function getControl(section: SectionElement | undefined) {
  if (!section) {
    return undefined;
  }
  return (section.props.children ?? section) as ControlElement | undefined;
}

function triggerNumeric(control: ControlElement | undefined, value: number) {
  control?.props.onPreviewValue?.(value);
  control?.props.onCommitValue?.(value);
}

describe('blur controls section', () => {
  it('renders grouped preset controls without shadow or border toggle actions', () => {
    const html = renderToStaticMarkup(
      <>{renderBlurControlsSection(createProps(true, { id: 'preset-header' }) as never)}</>
    );

    expect(html).toContain('preset-header');
    expect(html).toContain('Область');
    expect(html).toContain('Рамка');
    expect(html).toContain('Эффект');
    expect(html).toContain('aria-label="Толщина"');
    expect(html).toContain('value="5"');
    expect(html).toContain('aria-label="Прозрачность"');
    expect(html).toContain('value="60"');
    expect(html).toContain('Скругление углов');
    expect(html).not.toContain('Показать');
    expect(html).not.toContain('Скрыть');
    expect(html).not.toContain('Тень');
  });
});

describe('blur controls defaults', () => {
  it('uses legacy blur border defaults when stored fields are absent', () => {
    const props = createProps(true, null);
    props.inspectorToolSettings.blur = {
      amount: 12,
      blurType: 'solid',
      showBorder: true,
    };

    const html = renderToStaticMarkup(<>{renderBlurControlsSection(props as never)}</>);

    expect(html).toContain('aria-label="Толщина"');
    expect(html).toContain('value="0"');
    expect(html).toContain('aria-label="Прозрачность"');
    expect(html).toContain('value="100"');
    expect(html).toContain('Сплошная');
  });
});

describe('blur controls border state', () => {
  it('renders border controls with zero width when the legacy border is disabled', () => {
    const { groups, sections } = getSections(false);

    expect(groups.map((group) => group.props.label)).toEqual(['Область', 'Рамка']);
    expect(findSection(sections, 'Толщина')?.props.value).toBe(0);
  });
});

describe('blur controls callbacks', () => {
  it('wires grouped blur and frame controls into preview and apply patches', () => {
    const { props, sections } = getSections();
    const blurType = findSection(sections, 'Эффект');
    const amount = findSection(sections, 'Сила');
    const strokeColor = findSection(sections, 'Цвет');
    const strokeWidth = findSection(sections, 'Толщина');
    const style = findSection(sections, 'Стиль');
    const radius = findSection(sections, 'Скругление углов');
    const strokeOpacity = findSection(sections, 'Прозрачность');

    getControl(blurType)?.props.onChange?.('gaussian');
    triggerNumeric(getControl(amount), 18);
    getControl(strokeColor)?.props.onPreviewChange?.('#445566');
    getControl(strokeColor)?.props.onPreviewReset?.('#112233');
    getControl(strokeColor)?.props.onChange?.('#445566');
    triggerNumeric(getControl(strokeWidth), 9);
    getControl(style)?.props.onChange?.('dash-dot');
    triggerNumeric(getControl(radius), 12);
    triggerNumeric(getControl(strokeOpacity), 90);

    expect(props.previewColor).toHaveBeenCalledTimes(2);
    expect(props.updateColor).toHaveBeenCalledTimes(1);
    expect(props.applyBlurPatch).toHaveBeenCalledWith({ blurType: 'gaussian' });
    expect(props.previewBlurPatch).toHaveBeenCalledWith({ amount: 18 });
    expect(props.applyBlurPatch).toHaveBeenCalledWith({ strokeColor: '#445566' });
    expect(props.previewBlurPatch).toHaveBeenCalledWith({ showBorder: true, strokeWidth: 9 });
    expect(props.commitPendingSelectionSettings).toHaveBeenCalledTimes(4);
    expect(props.applyBlurPatch).toHaveBeenCalledWith({ strokeStyle: 'dash-dot' });
    expect(props.previewBlurPatch).toHaveBeenCalledWith({ radius: 12 });
    expect(props.previewBlurPatch).toHaveBeenCalledWith({ strokeOpacity: 0.9 });
  });
});

describe('blur controls zero border', () => {
  it('uses zero thickness patches to turn off the frame', () => {
    const { props, sections } = getSections();
    const strokeWidth = findSection(sections, 'Толщина');

    triggerNumeric(getControl(strokeWidth), 0);

    expect(props.previewBlurPatch).toHaveBeenCalledWith({ showBorder: false, strokeWidth: 0 });
  });
});
