import type { GuideBlock, GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ArrowLeft } from 'lucide-react';
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
      </fieldset>
    </div>
  );
}
