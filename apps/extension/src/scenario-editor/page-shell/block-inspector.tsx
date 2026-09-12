import type {
  GuideBlock,
  GuideBlockWidth,
  GuideStep,
  GuideTextStyle,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ArrowLeft,
  RotateCcw,
  Type,
  Columns2,
  MessageSquare,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { resolveGuideBlockWidth } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideInspectorGroup } from './inspector';
import { CompactSelect } from '../../ui/compact-inspector-controls/select';
import { CompactSegmentedSelector } from '../../ui/compact-inspector-controls/control-renderers';
import { guideNoteTypes } from './note-block';

/** Selected block controls publish existing typed properties through the canonical updater. */
export function GuideBlockInspector({
  item,
  block,
  disabled,
  onChange,
  onClose,
  t,
}: {
  item: GuideStep;
  block: GuideBlock;
  disabled: boolean;
  onChange: (block: GuideBlock, group?: string | null) => void;
  onClose: () => void;
  t: Translate;
}) {
  const width = resolveGuideBlockWidth(item.layout, block);
  const presets: Array<{
    value: string;
    width: GuideBlockWidth;
    percent: number;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      value: 'full',
      width: 'full',
      percent: 100,
      label: t('scenario.editor.guideFullWidth'),
      icon: <span aria-label={t('scenario.editor.guideFullWidth')}>1/1</span>,
    },
    {
      value: 'half',
      width: 'half',
      percent: 50,
      label: t('scenario.editor.guideHalfWidth'),
      icon: <span aria-label={t('scenario.editor.guideHalfWidth')}>1/2</span>,
    },
    {
      value: 'third',
      width: 33,
      percent: 33,
      label: t('scenario.editor.guideThirdWidth'),
      icon: <span aria-label={t('scenario.editor.guideThirdWidth')}>1/3</span>,
    },
    {
      value: 'quarter',
      width: 25,
      percent: 25,
      label: t('scenario.editor.guideQuarterWidth'),
      icon: <span aria-label={t('scenario.editor.guideQuarterWidth')}>1/4</span>,
    },
  ];
  const selected = presets.find((preset) => preset.percent === width)?.value ?? 'custom';
  return (
    <div className="guide-block-inspector">
      <div className="guide-appearance-heading">
        <h3>
          {t(
            block.kind === 'note'
              ? 'scenario.editor.guideAddNote'
              : block.kind === 'heading'
                ? 'scenario.editor.guideHeading'
                : block.kind === 'text'
                  ? 'scenario.editor.guideAddText'
                  : 'scenario.editor.guideBlockSettings'
          )}
        </h3>
        <ContentToolbarButton title={t('scenario.editor.guideStepSettings')} onClick={onClose}>
          <ArrowLeft size={16} aria-hidden="true" />
        </ContentToolbarButton>
      </div>
      <fieldset className="guide-style-fields" disabled={disabled}>
        <GuideInspectorGroup
          icon={Columns2}
          title={`${t('scenario.editor.guidePlacementGroup')} · ${width}%`}
        >
          <CompactSegmentedSelector
            columns={4}
            ariaLabel={t('scenario.editor.guideBlockWidth')}
            value={selected}
            options={presets}
            onChange={(next) => {
              const preset = presets.find((option) => option.value === next);
              if (preset) onChange({ ...block, width: preset.width }, null);
            }}
          />
        </GuideInspectorGroup>
        {block.kind === 'note' && (
          <GuideInspectorGroup icon={MessageSquare} title={t('scenario.editor.guideNoteType')}>
            <CompactSelect
              aria-label={t('scenario.editor.guideNoteType')}
              value={block.tone}
              options={guideNoteTypes.map(({ tone, key }) => ({ value: tone, label: t(key) }))}
              onChange={(tone) => onChange({ ...block, tone }, null)}
              disabled={disabled}
            />
          </GuideInspectorGroup>
        )}
        {(block.kind === 'text' || block.kind === 'heading' || block.kind === 'note') && (
          <GuideTextSettings block={block} onChange={onChange} t={t} />
        )}
      </fieldset>
    </div>
  );
}

/** Text options preserve other block properties; reset omits optional canonical metadata. */
function GuideTextSettings({
  block,
  onChange,
  t,
}: {
  block: Extract<GuideBlock, { kind: 'text' | 'heading' | 'note' }>;
  onChange: (block: GuideBlock, group?: string | null) => void;
  t: Translate;
}) {
  const style = block.textStyle ?? { size: 'normal', alignment: 'start' };
  const change = (patch: Partial<GuideTextStyle>) =>
    onChange({ ...block, textStyle: { ...style, ...patch } }, null);
  return (
    <GuideInspectorGroup icon={Type} title={t('scenario.editor.guideAddText')}>
      <span>{t('scenario.editor.guideTextSize')}</span>
      <CompactSelect
        aria-label={t('scenario.editor.guideTextSize')}
        value={style.size}
        options={[
          { value: 'small', label: t('scenario.editor.guideTextSmall') },
          { value: 'normal', label: t('scenario.editor.guideTextNormal') },
          { value: 'large', label: t('scenario.editor.guideTextLarge') },
        ]}
        onChange={(size) => change({ size })}
      />
      <span>{t('scenario.editor.guideTextAlignment')}</span>
      <CompactSegmentedSelector
        columns={3}
        ariaLabel={t('scenario.editor.guideTextAlignment')}
        value={style.alignment}
        options={[
          {
            value: 'start',
            icon: <AlignLeft size={15} aria-hidden="true" />,
            label: t('scenario.editor.guideTextStart'),
          },
          {
            value: 'center',
            icon: <AlignCenter size={15} aria-hidden="true" />,
            label: t('scenario.editor.guideTextCenter'),
          },
          {
            value: 'end',
            icon: <AlignRight size={15} aria-hidden="true" />,
            label: t('scenario.editor.guideTextEnd'),
          },
        ]}
        onChange={(alignment) => change({ alignment })}
      />
      <ContentToolbarButton
        title={t('scenario.editor.guideTextReset')}
        disabled={!block.textStyle}
        onClick={() => {
          const { textStyle, ...rest } = block;
          void textStyle;
          onChange(rest, null);
        }}
      >
        <RotateCcw size={15} aria-hidden="true" />
      </ContentToolbarButton>
    </GuideInspectorGroup>
  );
}
