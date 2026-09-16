import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { ProductToggle, ProductInput } from '@sniptale/ui/product-form-controls';
import { ListOrdered } from 'lucide-react';
import { GuideInspectorGroup, GuideInspectorNumber } from './inspector';
import type { Translate } from '../../platform/i18n';
import { resolveGuideNumbering } from '../../features/scenario/project/public';

type GuideItem = GuideProject['items'][number];

/** Edits explicit numbering metadata; derived counters remain owned by the pure resolver. */
export function GuideNumberingControls({
  project,
  item,
  disabled,
  onChange,
  t,
}: {
  project: GuideProject;
  item: GuideItem;
  disabled: boolean;
  onChange: (item: GuideItem, group?: string | null) => void;
  t: Translate;
}) {
  const restartAt = item.numbering?.restartAt;
  const restart = (value: number | undefined, group: string | null = null) =>
    onChange(
      withNumbering(item, value, item.kind === 'step' ? item.numbering?.label : undefined),
      group
    );
  return (
    <fieldset className="guide-numbering-fields" disabled={disabled}>
      <GuideInspectorGroup title={t('scenario.editor.guideNumbering')} icon={ListOrdered}>
        {item.kind === 'step' && (
          <label className="guide-number-toggle">
            <ProductToggle
              size="sm"
              aria-label={t('scenario.editor.guideShowNumber')}
              checked={item.showNumber}
              onClick={() => onChange({ ...item, showNumber: !item.showNumber }, null)}
            />
            {t('scenario.editor.guideShowNumber')}
          </label>
        )}
        <label className="guide-number-toggle">
          <ProductToggle
            size="sm"
            aria-label={t('scenario.editor.guideRestartNumbering')}
            checked={restartAt !== undefined}
            onClick={() => restart(restartAt === undefined ? 1 : undefined)}
          />
          {t('scenario.editor.guideRestartNumbering')}
        </label>
        {restartAt !== undefined && (
          <GuideInspectorNumber
            label={t('scenario.editor.guideStartAt')}
            min={1}
            max={GUIDE_LIMITS.maxRestartNumber}
            value={restartAt}
            disabled={disabled}
            onChange={(value) => restart(value, `number-start:${item.id}`)}
          />
        )}
        {item.kind === 'step' && item.showNumber && (
          <label className="guide-numbering-field">
            <span>{t('scenario.editor.guideCustomNumber')}</span>
            <ProductInput
              value={item.numbering?.label ?? ''}
              maxLength={GUIDE_LIMITS.maxNumberLabelLength}
              placeholder={t('scenario.editor.guideAutomaticNumber')}
              onChange={(event) =>
                onChange(
                  withNumbering(
                    item,
                    restartAt,
                    event.target.value.trim() ? event.target.value : undefined
                  ),
                  `number-label:${item.id}`
                )
              }
            />
          </label>
        )}
        <div className="guide-numbering-next">
          <span>{t('scenario.editor.guideNextAutomaticNumber')}</span>
          <output aria-label={t('scenario.editor.guideNextAutomaticNumber')}>
            {resolveGuideNumbering(project.items).get(item.id)?.nextAutomaticNumber}
          </output>
        </div>
      </GuideInspectorGroup>
    </fieldset>
  );
}

/** Canonical documents omit cleared fields: their bounded parser rejects own undefined values. */
function withNumbering(
  item: GuideItem,
  restartAt: number | undefined,
  label: string | undefined
): GuideItem {
  const next = { ...item };
  delete next.numbering;
  if (next.kind === 'section') {
    if (restartAt !== undefined) next.numbering = { restartAt };
  } else if (restartAt !== undefined || label !== undefined) {
    next.numbering = {
      ...(restartAt === undefined ? {} : { restartAt }),
      ...(label === undefined ? {} : { label }),
    };
  }
  return next;
}
