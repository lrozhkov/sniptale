import { translate } from '../../../platform/i18n';
import {
  requiredManifestPermissionDisclosures,
  type RequiredManifestPermissionDisclosure,
} from './permissions-lib/required-disclosures';

const requiredGrantCardClassName = [
  'grid gap-3 rounded-[14px] border p-4',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,var(--sniptale-color-surface-canvas)_22%)]',
].join(' ');

const requiredGrantIconClassName = [
  'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px] border',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_76%,transparent)]',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');

function RequiredManifestGrantCard(props: { disclosure: RequiredManifestPermissionDisclosure }) {
  const Icon = props.disclosure.icon;

  return (
    <div className={requiredGrantCardClassName}>
      <div className="flex items-start gap-3">
        <div className={requiredGrantIconClassName}>
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate(props.disclosure.nameKey)}
          </h3>
          <p className="mt-1 text-sm leading-5 text-[var(--sniptale-color-text-secondary)]">
            {translate(props.disclosure.descriptionKey)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function RequiredManifestPermissionDisclosureList() {
  return (
    <section
      className="mt-6 grid gap-3"
      aria-label={translate('settings.permissions.requiredGrantsTitle')}
    >
      <div>
        <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('settings.permissions.requiredGrantsTitle')}
        </h2>
        <p className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.permissions.requiredGrantsDescription')}
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {requiredManifestPermissionDisclosures.map((disclosure) => (
          <RequiredManifestGrantCard key={disclosure.id} disclosure={disclosure} />
        ))}
      </div>
    </section>
  );
}
