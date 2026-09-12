import type {
  GuideBlock,
  GuideStep,
  GuideTextStyle,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { resolveGuideBlockWidth } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
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
        <span>{t('scenario.editor.guideBlockWidth')}</span>
        <SegmentedSwitch
          density="compact"
          ariaLabel={t('scenario.editor.guideBlockWidth')}
          activeId={resolveGuideBlockWidth(item.layout, block)}
          options={[
            { id: 'full', label: t('scenario.editor.guideFullWidth') },
            { id: 'half', label: t('scenario.editor.guideHalfWidth') },
          ]}
          onChange={(width) => onChange({ ...block, width }, null)}
        />
        {block.kind === 'note' && (
          <>
            <span>{t('scenario.editor.guideNoteType')}</span>
            <SegmentedSwitch
              density="compact"
              wrap
              ariaLabel={t('scenario.editor.guideNoteType')}
              activeId={block.tone}
              options={guideNoteTypes.map(({ tone, key }) => ({ id: tone, label: t(key) }))}
              onChange={(tone) => onChange({ ...block, tone }, null)}
            />
          </>
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
    <>
      <span>{t('scenario.editor.guideTextSize')}</span>
      <SegmentedSwitch
        density="compact"
        ariaLabel={t('scenario.editor.guideTextSize')}
        activeId={style.size}
        options={[
          { id: 'small', label: t('scenario.editor.guideTextSmall') },
          { id: 'normal', label: t('scenario.editor.guideTextNormal') },
          { id: 'large', label: t('scenario.editor.guideTextLarge') },
        ]}
        onChange={(size) => change({ size })}
      />
      <span>{t('scenario.editor.guideTextAlignment')}</span>
      <SegmentedSwitch
        density="compact"
        ariaLabel={t('scenario.editor.guideTextAlignment')}
        activeId={style.alignment}
        options={[
          { id: 'start', label: t('scenario.editor.guideTextStart') },
          { id: 'center', label: t('scenario.editor.guideTextCenter') },
          { id: 'end', label: t('scenario.editor.guideTextEnd') },
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
    </>
  );
}
