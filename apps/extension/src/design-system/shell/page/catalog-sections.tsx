import { translate } from '../../../platform/i18n';
import { DESIGN_TOKEN_GROUPS } from '../../catalog/registry';

const MUTED_PANEL_CLASS =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_56%,transparent)] p-5';

const TOKEN_GROUP_ITEM_CLASS =
  'rounded-[14px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)] ' +
  'px-3 py-2 text-xs text-[var(--sniptale-color-text-secondary)]';

const MUTED_SECTION_LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-[0.14em] ' +
  'text-[var(--sniptale-color-text-muted-strong)]';

export function DesignSystemTokenGroupsSection() {
  return (
    <section id="tokens" className={MUTED_PANEL_CLASS + ' scroll-mt-36'}>
      <div className={'mb-1 ' + MUTED_SECTION_LABEL_CLASS}>
        {translate('designSystem.page.tokenGroupsTitle')}
      </div>
      <p className="mb-4 text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
        {translate('designSystem.page.tokenGroupsDescription')}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {DESIGN_TOKEN_GROUPS.map((group) => (
          <article
            key={group.tokenGroupId}
            className={
              'rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)] ' +
              'p-4 shadow-sm'
            }
          >
            <div className="text-base font-semibold text-[var(--sniptale-color-text-primary-strong)]">
              {group.labelRu}
            </div>
            <div className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
              {group.labelEn}
            </div>
            <div className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
              {group.source}
            </div>
            <div className="mt-3 space-y-2">
              {group.items.map((token) => (
                <div key={token} className={TOKEN_GROUP_ITEM_CLASS}>
                  {token}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
