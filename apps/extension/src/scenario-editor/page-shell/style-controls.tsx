import type { GuideStyle, GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { ColorField } from '../../ui/compact-inspector-controls/controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { RotateCcw, Palette, LayoutTemplate, ScanLine } from 'lucide-react';
import { CompactSelect } from '../../ui/compact-inspector-controls/select';
import { GuideInspectorGroup } from './inspector';
import type { Translate } from '../../platform/i18n';
import { guideDocumentStyle } from './document-appearance';

const choices = {
  theme: [
    ['paper', 'appearancePaper'],
    ['warm', 'appearanceWarm'],
    ['graphite', 'appearanceGraphite'],
  ],
  font: [
    ['sans', 'appearanceSans'],
    ['serif', 'appearanceSerif'],
  ],
  density: [
    ['compact', 'appearanceCompact'],
    ['comfortable', 'appearanceComfortable'],
    ['spacious', 'appearanceSpacious'],
  ],
  contentWidth: [
    ['narrow', 'appearanceNarrow'],
    ['standard', 'appearanceStandard'],
    ['wide', 'appearanceWide'],
  ],
  imageBorder: [
    ['none', 'appearanceNone'],
    ['subtle', 'appearanceSubtle'],
    ['strong', 'appearanceStrong'],
  ],
  numberStyle: [
    ['plain', 'appearancePlain'],
    ['badge', 'appearanceBadge'],
  ],
  layout: [
    ['stacked', 'appearanceStacked'],
    ['side-by-side', 'appearanceSideBySide'],
    ['comparison', 'appearanceComparison'],
    ['text', 'appearanceText'],
  ],
} as const;
type ChoiceLabel = (typeof choices)[keyof typeof choices][number][1];

function StyleChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  t,
  segmented = false,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, ChoiceLabel])[];
  onChange: (value: T) => void;
  t: Translate;
  segmented?: boolean;
}) {
  return (
    <div className="guide-inspector-choice">
      <span>{label}</span>
      {segmented ? (
        <SegmentedSwitch
          density="compact"
          ariaLabel={label}
          activeId={value}
          options={options.map(([id, key]) => ({ id, label: t(`scenario.editor.${key}`) }))}
          onChange={onChange}
        />
      ) : (
        <CompactSelect
          aria-label={label}
          value={value}
          options={options.map(([value, key]) => ({ value, label: t(`scenario.editor.${key}`) }))}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** Compact fields emit only the edited key, so unmodified values keep inheriting. */
export function GuideStyleFields({
  style,
  disabled,
  onChange,
  t,
}: {
  style: GuideStyle;
  disabled: boolean;
  onChange: (patch: Partial<GuideStyle>) => void;
  t: Translate;
}) {
  return (
    <fieldset className="guide-style-fields" disabled={disabled}>
      <GuideInspectorGroup icon={Palette} title={t('scenario.editor.guideStyleGroup')}>
        <StyleChoice
          label={t('scenario.editor.appearanceTheme')}
          value={style.theme}
          options={choices.theme}
          onChange={(theme) => onChange({ theme })}
          t={t}
          segmented
        />
        <StyleChoice
          label={t('scenario.editor.appearanceFont')}
          value={style.font}
          options={choices.font}
          onChange={(font) => onChange({ font })}
          t={t}
          segmented
        />
        <div className="guide-style-accent">
          <ColorField
            label={t('scenario.editor.appearanceAccent')}
            title={t('scenario.editor.appearanceAccent')}
            value={guideDocumentStyle(style)['--guide-accent']!}
            disabled={disabled}
            allowAlpha={false}
            allowTransparent={false}
            onChange={(accentColor) => onChange({ accentColor })}
          />
          <ContentToolbarButton
            title={t('scenario.editor.appearanceAccentReset')}
            disabled={disabled || style.accentColor === null}
            onClick={() => onChange({ accentColor: null })}
          >
            <RotateCcw size={15} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
      </GuideInspectorGroup>
      <GuideInspectorGroup icon={LayoutTemplate} title={t('scenario.editor.guideLayoutGroup')}>
        <StyleChoice
          label={t('scenario.editor.appearanceDensity')}
          value={style.density}
          options={choices.density}
          onChange={(density) => onChange({ density })}
          t={t}
        />
        <StyleChoice
          label={t('scenario.editor.appearanceWidth')}
          value={style.contentWidth}
          options={choices.contentWidth}
          onChange={(contentWidth) => onChange({ contentWidth })}
          t={t}
        />
      </GuideInspectorGroup>
      <GuideInspectorGroup icon={ScanLine} title={t('scenario.editor.guideDetailsGroup')}>
        <StyleChoice
          label={t('scenario.editor.appearanceBorder')}
          value={style.imageBorder}
          options={choices.imageBorder}
          onChange={(imageBorder) => onChange({ imageBorder })}
          t={t}
        />
        <StyleChoice
          label={t('scenario.editor.appearanceNumber')}
          value={style.numberStyle}
          options={choices.numberStyle}
          onChange={(numberStyle) => onChange({ numberStyle })}
          t={t}
          segmented
        />
      </GuideInspectorGroup>
    </fieldset>
  );
}

export function GuideLayoutFields({
  layout,
  disabled,
  onChange,
  t,
}: {
  layout: GuideStep['layout'];
  disabled: boolean;
  onChange: (layout: GuideStep['layout']) => void;
  t: Translate;
}) {
  return (
    <fieldset className="guide-style-fields" disabled={disabled}>
      <GuideInspectorGroup icon={LayoutTemplate} title={t('scenario.editor.appearanceLayout')}>
        <CompactSelect
          aria-label={t('scenario.editor.appearanceLayout')}
          value={layout}
          disabled={disabled}
          options={choices.layout.map(([value, key]) => ({
            value,
            label: t(`scenario.editor.${key}`),
          }))}
          onChange={onChange}
        />
      </GuideInspectorGroup>
    </fieldset>
  );
}
