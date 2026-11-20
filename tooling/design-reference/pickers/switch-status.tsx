import { useState } from 'react';
import {
  SegmentedRow,
  ToggleField,
} from '../../../apps/extension/src/ui/compact-inspector-controls/controls';
import { InspectorSurface } from '../../../apps/extension/src/ui/compact-inspector-controls/layout';
import { PreviewNumericRow } from '../../../apps/extension/src/ui/compact-inspector-controls/numeric-preview';
import type { AppLocale } from '../../../apps/extension/src/platform/i18n';

const labels = {
  en: {
    shadow: 'Shadow',
    grid: 'Show grid',
    preview: 'Shadow preview',
    type: 'Type',
    outer: 'Outer',
    inner: 'Inner',
    direction: 'Direction',
    up: 'Up',
    center: 'Center',
    down: 'Down',
    opacity: 'Opacity',
    blur: 'Blur',
    offset: 'Offset Y',
    radius: 'Corner radius',
  },
  ru: {
    shadow: 'Тень',
    grid: 'Показать сетку',
    preview: 'Предпросмотр тени',
    type: 'Тип',
    outer: 'Снаружи',
    inner: 'Внутри',
    direction: 'Направление',
    up: 'Вверх',
    center: 'Центр',
    down: 'Вниз',
    opacity: 'Непрозрачность',
    blur: 'Размытие',
    offset: 'Смещение Y',
    radius: 'Скругление',
  },
} satisfies Record<AppLocale, Record<string, string>>;

export function SwitchStatus({ locale }: { locale: AppLocale }) {
  const copy = labels[locale];
  const [enabled, setEnabled] = useState(true);
  const [grid, setGrid] = useState(false);
  const [type, setType] = useState<'outer' | 'inner'>('outer');
  const [direction, setDirection] = useState<'up' | 'center' | 'down'>('down');
  const [opacity, setOpacity] = useState(25);
  const [opacityDraft, setOpacityDraft] = useState<number | null>(null);
  const [blur, setBlur] = useState(20);
  const [offset, setOffset] = useState(12);
  const [radius, setRadius] = useState(16);
  const offsetY = direction === 'center' ? 0 : direction === 'up' ? -offset : offset;
  const shadow = `${type === 'inner' ? 'inset ' : ''}0 ${offsetY}px ${blur}px rgba(24, 27, 35, ${(opacityDraft ?? opacity) / 100})`;
  return (
    <InspectorSurface className="reference-switch-inspector">
      <div
        className="reference-switch-preview"
        aria-label={copy.preview}
        role="img"
        data-grid={grid}
      >
        <div
          className="reference-switch-subject"
          style={{ borderRadius: radius, boxShadow: enabled ? shadow : 'none' }}
        />
      </div>
      <section className="sniptale-parameter-stack" aria-label={copy.shadow}>
        <ToggleField label={copy.shadow} value={enabled} showStatus onChange={setEnabled} />
        <div className="sniptale-parameter-stack sniptale-parameter-dependents">
          <SegmentedRow
            ariaLabel={copy.type}
            label={copy.type}
            columns={2}
            value={type}
            onChange={setType}
            options={(['outer', 'inner'] as const).map((value) => ({
              value,
              label: copy[value],
              disabled: !enabled,
            }))}
          />
          <SegmentedRow
            ariaLabel={copy.direction}
            label={copy.direction}
            columns={3}
            value={direction}
            onChange={setDirection}
            options={(['up', 'center', 'down'] as const).map((value) => ({
              value,
              label: copy[value],
              disabled: !enabled,
            }))}
          />
          <PreviewNumericRow
            label={copy.opacity}
            unit="%"
            value={opacity}
            min={0}
            max={100}
            step={1}
            rangePresentation="field"
            disabled={!enabled}
            onPreview={setOpacityDraft}
            onChange={(value) => {
              setOpacityDraft(null);
              setOpacity(value);
            }}
          />
          <PreviewNumericRow
            label={copy.blur}
            unit="px"
            value={blur}
            min={0}
            max={48}
            step={1}
            disabled={!enabled}
            onChange={setBlur}
          />
          <PreviewNumericRow
            label={copy.offset}
            unit="px"
            value={direction === 'center' ? 0 : offset}
            min={0}
            max={24}
            step={1}
            disabled={!enabled || direction === 'center'}
            onChange={setOffset}
          />
        </div>
      </section>
      <div className="sniptale-parameter-stack reference-switch-independent">
        <PreviewNumericRow
          label={copy.radius}
          unit="px"
          value={radius}
          min={0}
          max={40}
          step={1}
          onChange={setRadius}
        />
        <ToggleField label={copy.grid} value={grid} onChange={setGrid} />
      </div>
    </InspectorSurface>
  );
}
