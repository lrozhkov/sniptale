import { Fragment, useEffect, useState } from 'react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import type {
  GuideBlock,
  GuideBlockWidth,
  GuideStep,
  GuideTextStyle,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ScenarioInspectorBackButton } from './inspector-actions';
import {
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
import { GuideInspectorGroup, InspectorCategorizedContent } from './inspector';
import { CompactSelect } from '../../ui/compact-inspector-controls/select';
import { CompactSegmentedSelector } from '../../ui/compact-inspector-controls/control-renderers';
import { NumericRow } from '../../ui/compact-inspector-controls/numeric';
import { guideNoteTypes } from './note-block';

/** Selected block controls publish existing typed properties through the canonical updater. */
export function GuideBlockInspector({
  item,
  presentation = 'all',
  block,
  disabled,
  onChange,
  onClose,
  t,
}: {
  item: GuideStep;
  presentation?: 'all' | 'sections';
  block: GuideBlock;
  disabled: boolean;
  onChange: (block: GuideBlock, group?: string | null) => void;
  onClose: () => void;
  t: Translate;
}) {
  const [activeSection, setActiveSection] = useState('placement');
  const sections = [
    {
      id: 'placement',
      label: t('scenario.editor.guidePlacementGroup'),
      icon: Columns2,
      content: (
        <GuideBlockPlacement
          item={item}
          block={block}
          disabled={disabled}
          onChange={onChange}
          t={t}
        />
      ),
    },
    ...(block.kind === 'note'
      ? [
          {
            id: 'noteType',
            label: t('scenario.editor.guideNoteType'),
            icon: MessageSquare,
            content: (
              <GuideInspectorGroup
                id="noteType"
                collapsible={false}
                icon={MessageSquare}
                title={t('scenario.editor.guideNoteType')}
              >
                <CompactSelect
                  aria-label={t('scenario.editor.guideNoteType')}
                  value={block.tone}
                  options={guideNoteTypes.map(({ tone, key }) => ({ value: tone, label: t(key) }))}
                  onChange={(tone) => onChange({ ...block, tone }, null)}
                  disabled={disabled}
                />
              </GuideInspectorGroup>
            ),
          },
        ]
      : []),
    ...(block.kind === 'text' || block.kind === 'heading' || block.kind === 'note'
      ? [
          {
            id: 'addText',
            label: t('scenario.editor.guideAddText'),
            icon: Type,
            content: <GuideTextSettings block={block} onChange={onChange} t={t} />,
          },
        ]
      : []),
  ];
  return (
    <div className="guide-block-inspector">
      <ScenarioInspectorBackButton
        label={t('scenario.editor.guideStepSettings')}
        onBack={onClose}
      />
      <fieldset className="guide-style-fields" disabled={disabled}>
        {presentation === 'sections' && block.kind === 'text' ? (
          <CategorizedInspector
            dataUi="scenario-editor.inspector-categories"
            ariaLabel={t('scenario.editor.guideAddText')}
            initialSection={activeSection}
            onSectionChange={setActiveSection}
            sections={sections}
            showSectionHeading
            renderSection={(id) => (
              <InspectorCategorizedContent>
                {sections.find((section) => section.id === id)?.content}
              </InspectorCategorizedContent>
            )}
          />
        ) : (
          sections.map(({ id, content }) => <Fragment key={id}>{content}</Fragment>)
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
    <GuideInspectorGroup id="addText" icon={Type} title={t('scenario.editor.guideAddText')}>
      <span>{t('scenario.editor.guideTextSize')}</span>
      <CompactSegmentedSelector
        columns={3}
        ariaLabel={t('scenario.editor.guideTextSize')}
        value={style.size}
        options={[
          { value: 'small', label: t('scenario.editor.guideTextSmall') },
          {
            value: 'normal',
            label: t(
              block.kind === 'heading'
                ? 'scenario.editor.guideHeadingMedium'
                : 'scenario.editor.guideTextNormal'
            ),
          },
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
      <div className="guide-inspector-reset">
        <ProductActionButton
          compact
          tone="secondary"
          title={t('scenario.editor.guideTextReset')}
          disabled={!block.textStyle}
          onClick={() => {
            const { textStyle, ...rest } = block;
            void textStyle;
            onChange(rest, null);
          }}
        >
          <RotateCcw size={15} aria-hidden="true" />
          {t('scenario.editor.guideTextReset')}
        </ProductActionButton>
      </div>
    </GuideInspectorGroup>
  );
}

/** Shared placement fields publish the same block metadata for text and images. */
export function GuideBlockPlacement<T extends GuideBlock>({
  item,
  block,
  disabled,
  onChange,
  t,
}: {
  item: Pick<GuideStep, 'layout'>;
  block: T;
  disabled: boolean;
  onChange: (block: T, group?: string | null) => void;
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
      icon: <span aria-label={t('scenario.editor.guideFullWidth')}>1:1</span>,
    },
    {
      value: 'half',
      width: 'half',
      percent: 50,
      label: t('scenario.editor.guideHalfWidth'),
      icon: <span aria-label={t('scenario.editor.guideHalfWidth')}>1:2</span>,
    },
    {
      value: 'third',
      width: 33,
      percent: 33,
      label: t('scenario.editor.guideThirdWidth'),
      icon: <span aria-label={t('scenario.editor.guideThirdWidth')}>1:3</span>,
    },
    {
      value: 'quarter',
      width: 25,
      percent: 25,
      label: t('scenario.editor.guideQuarterWidth'),
      icon: <span aria-label={t('scenario.editor.guideQuarterWidth')}>1:4</span>,
    },
  ];
  const selected = presets.find((preset) => preset.percent === width)?.value ?? 'custom';
  return (
    <GuideInspectorGroup
      id="placement"
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
      <label className="guide-html-switch">
        <span>{t('scenario.editor.guideRowStart')}</span>
        <ProductToggle
          size="sm"
          checked={block.rowStart ?? false}
          disabled={disabled}
          aria-label={t('scenario.editor.guideRowStart')}
          onClick={() => onChange({ ...block, rowStart: !block.rowStart }, null)}
        />
      </label>
      {(block.kind === 'text' || block.kind === 'heading' || block.kind === 'note') && (
        <GuideBlockHeight
          key={block.id}
          value={block.minHeight ?? 0}
          disabled={disabled}
          onChange={(minHeight) => onChange({ ...block, minHeight }, null)}
          t={t}
        />
      )}
    </GuideInspectorGroup>
  );
}

/** Scrubbing previews locally and publishes one canonical height on release. */
function GuideBlockHeight({
  value,
  disabled,
  onChange,
  t,
}: {
  value: number;
  disabled: boolean;
  onChange: (height: number) => void;
  t: Translate;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => setPreview(null), [value, disabled]);
  const commit = (height: number) => {
    setPreview(null);
    if (height !== value) onChange(height);
  };
  return (
    <>
      <NumericRow
        appearance="plain"
        label={t('scenario.editor.guideBlockHeight')}
        value={preview ?? value}
        min={0}
        max={GUIDE_LIMITS.maxDimension}
        step={1}
        precision={0}
        normalizeValue={Math.round}
        scrub={{ min: 0, max: GUIDE_LIMITS.maxDimension, step: 1 }}
        disabled={disabled}
        focusAppearance="accent-box"
        onPreviewValue={setPreview}
        onCommitValue={commit}
      />
      <ProductActionButton
        compact
        tone="secondary"
        disabled={disabled || !value}
        onClick={() => commit(0)}
      >
        <RotateCcw size={15} aria-hidden="true" />
        {t('scenario.editor.guideAutoHeight')}
      </ProductActionButton>
    </>
  );
}
