import { translate } from '../../../platform/i18n';
import { DESIGN_SYSTEM_PAGE_NAVIGATION } from '../../catalog/registry/page-controls';
import { HeaderAnchor } from './primitives';

const NAVIGATION_PANEL_CLASS =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)] p-3';

export function DesignSystemNavigationRail() {
  return (
    <aside className="xl:sticky xl:top-28 xl:self-start">
      <div className={NAVIGATION_PANEL_CLASS}>
        <nav className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:gap-1 xl:overflow-visible xl:pb-0">
          {DESIGN_SYSTEM_PAGE_NAVIGATION.map((section) => (
            <HeaderAnchor
              key={section.id}
              href={section.hash}
              label={translate(section.labelKey)}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}
