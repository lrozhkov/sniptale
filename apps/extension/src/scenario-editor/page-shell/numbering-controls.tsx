import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { ProductInput } from '@sniptale/ui/product-form-controls';
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
      <legend>{t('scenario.editor.guideNumbering')}</legend>
      {item.kind === 'step' && (
        <label className="guide-number-toggle">
          <input
            type="checkbox"
            checked={item.showNumber}
            onChange={(event) => onChange({ ...item, showNumber: event.target.checked }, null)}
          />
          {t('scenario.editor.guideShowNumber')}
        </label>
      )}
      <label className="guide-number-toggle">
        <input
          type="checkbox"
          checked={restartAt !== undefined}
          onChange={(event) => restart(event.target.checked ? 1 : undefined)}
        />
        {t('scenario.editor.guideRestartNumbering')}
      </label>
      {restartAt !== undefined && (
        <label className="guide-numbering-field">
          <span>{t('scenario.editor.guideStartAt')}</span>
          <ProductInput
            type="number"
            min={1}
            max={GUIDE_LIMITS.maxRestartNumber}
            step={1}
            value={restartAt}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isInteger(value) && value >= 1 && value <= GUIDE_LIMITS.maxRestartNumber)
                restart(value, `number-start:${item.id}`);
            }}
          />
        </label>
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
