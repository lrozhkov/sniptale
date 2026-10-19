import type { KeyboardEvent } from 'react';
import { InspectorParameterRow } from '../../../ui/compact-inspector-controls/layout';
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
import { TourInspectorNumericRow } from './numeric-row';
import { GuideInspectorGroup } from '../inspector';
import type { Translate } from '../../../platform/i18n';

/** Arrow navigation remains inside the authored navigation-slide property choice. */
function handleLayoutChoiceKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  const key = event.key;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ].filter((button) => !button.disabled);
  const index = buttons.findIndex((button) => button === event.target);
  if (index < 0) return;
  event.preventDefault();
  event.stopPropagation();
  const next =
    key === 'Home'
      ? 0
      : key === 'End'
        ? buttons.length - 1
        : (index + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1) + buttons.length) %
          buttons.length;
  buttons[next]!.focus();
  buttons[next]!.click();
}

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
    <GuideInspectorGroup
      id="composition"
      icon={LayoutPanelTop}
      title={t('scenario.editor.tourComposition')}
    >
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
        <InspectorParameterRow key={key} label={label} valueMinimum={104}>
          <div
            role="radiogroup"
            aria-label={label}
            className="flex gap-1"
            onKeyDown={handleLayoutChoiceKeyDown}
          >
            {values.map(({ value, Icon, label: title }) => (
              <ContentToolbarButton
                tone="property"
                className="!h-8 !w-8 !min-w-8 !p-0"
                key={value}
                title={title}
                disabled={disabled}
                role="radio"
                aria-checked={layout[key] === value}
                active={layout[key] === value}
                tabIndex={!disabled && layout[key] === value ? 0 : -1}
                onClick={() => onChange({ ...slide, layout: { ...layout, [key]: value } })}
              >
                <Icon size={16} aria-hidden="true" />
              </ContentToolbarButton>
            ))}
          </div>
        </InspectorParameterRow>
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
        <TourInspectorNumericRow
          key={key}
          {...props}
          value={layout[key]}
          disabled={disabled}
          onChange={(value) => onChange({ ...slide, layout: { ...layout, [key]: value } })}
        />
      ))}
      <InspectorParameterRow label={t('scenario.editor.tourButtonColumns')} valueMinimum={104}>
        <div
          role="radiogroup"
          aria-label={t('scenario.editor.tourButtonColumns')}
          onKeyDown={handleLayoutChoiceKeyDown}
          className="flex gap-1"
        >
          {([1, 2, 3] as const).map((columns) => (
            <ContentToolbarButton
              tone="property"
              className="!h-8 !w-8 !min-w-8 !p-0"
              key={columns}
              title={`${t('scenario.editor.tourButtonColumns')}: ${columns}`}
              disabled={disabled}
              role="radio"
              aria-checked={layout.columns === columns}
              active={layout.columns === columns}
              tabIndex={!disabled && layout.columns === columns ? 0 : -1}
              onClick={() => onChange({ ...slide, layout: { ...layout, columns } })}
            >
              {columns}
            </ContentToolbarButton>
          ))}
        </div>
      </InspectorParameterRow>
    </GuideInspectorGroup>
  );
}
