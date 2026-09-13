import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUp,
  Minus,
  ArrowDown,
  LayoutPanelTop,
} from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  TOUR_NAVIGATION_LAYOUT,
  type TourNavigationSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import { GuideInspectorGroup } from '../inspector';
import type { Translate } from '../../../platform/i18n';

/** Compact authored composition settings affect only this navigation slide. */
export function TourNavigationLayoutSettings({
  slide,
  disabled,
  onChange,
  t,
}: {
  slide: TourNavigationSlide;
  disabled: boolean;
  onChange: (slide: TourNavigationSlide) => boolean;
  t: Translate;
}) {
  const layout = slide.layout ?? TOUR_NAVIGATION_LAYOUT;
  const alignments = [
    { value: 'start', Icon: AlignLeft, label: t('scenario.editor.tourNavigationAlignStart') },
    { value: 'center', Icon: AlignCenter, label: t('scenario.editor.tourNavigationAlignCenter') },
    { value: 'end', Icon: AlignRight, label: t('scenario.editor.tourNavigationAlignEnd') },
  ] as const;
  const verticals = [
    { value: 'start', Icon: ArrowUp, label: t('scenario.editor.tourPositionTop') },
    { value: 'center', Icon: Minus, label: t('scenario.editor.tourPositionMiddle') },
    { value: 'end', Icon: ArrowDown, label: t('scenario.editor.tourPositionBottom') },
  ] as const;
  return (
    <GuideInspectorGroup icon={LayoutPanelTop} title={t('scenario.editor.tourComposition')}>
      {(
        [
          { key: 'align', label: t('scenario.editor.tourAlignment'), values: alignments },
          {
            key: 'vertical',
            label: t('scenario.editor.tourNavigationPosition'),
            values: verticals,
          },
        ] as const
      ).map(({ key, label, values }) => (
        <div key={key} className="tour-layout-setting">
          <span>{label}</span>
          <div role="group" aria-label={label}>
            {values.map(({ value, Icon, label: title }) => (
              <ContentToolbarButton
                key={value}
                title={title}
                disabled={disabled}
                aria-pressed={layout[key] === value}
                onClick={() => onChange({ ...slide, layout: { ...layout, [key]: value } })}
              >
                <Icon size={16} aria-hidden="true" />
              </ContentToolbarButton>
            ))}
          </div>
        </div>
      ))}
      {(
        [
          {
            key: 'width',
            label: t('scenario.editor.tourContentWidth'),
            min: 30,
            max: 100,
            unit: '%',
          },
          {
            key: 'padding',
            label: t('scenario.editor.tourContentPadding'),
            min: 0,
            max: 12,
            unit: '%',
          },
          { key: 'gap', label: t('scenario.editor.tourContentGap'), min: 0, max: 32, unit: 'px' },
        ] as const
      ).map(({ key, ...props }) => (
        <NumericRow
          key={key}
          {...props}
          value={layout[key]}
          disabled={disabled}
          onPreviewValue={() => {}}
          onCommitValue={(value) => onChange({ ...slide, layout: { ...layout, [key]: value } })}
        />
      ))}
      <div className="tour-layout-setting">
        <span>{t('scenario.editor.tourButtonColumns')}</span>
        <div role="group" aria-label={t('scenario.editor.tourButtonColumns')}>
          {([1, 2, 3] as const).map((columns) => (
            <ContentToolbarButton
              key={columns}
              title={`${t('scenario.editor.tourButtonColumns')}: ${columns}`}
              disabled={disabled}
              aria-pressed={layout.columns === columns}
              onClick={() => onChange({ ...slide, layout: { ...layout, columns } })}
            >
              {columns}
            </ContentToolbarButton>
          ))}
        </div>
      </div>
    </GuideInspectorGroup>
  );
}
