import { translate } from '../../../../../platform/i18n';
import {
  requiredManifestPermissionDisclosures,
  type RequiredPermissionCategory,
  type RequiredManifestPermissionDisclosure,
} from './permissions-lib/required-disclosures';

const categoryOrder: RequiredPermissionCategory[] = ['core', 'page', 'capture'];
const categoryHeadingClassName = [
  'text-xs font-semibold uppercase tracking-[0.08em]',
  'text-[var(--sniptale-color-text-muted-strong)]',
].join(' ');

const categoryTitleKeys = {
  capture: 'settings.permissions.requiredCategoryCapture',
  core: 'settings.permissions.requiredCategoryCore',
  page: 'settings.permissions.requiredCategoryPage',
} as const;

const requiredGrantCardClassName = [
  'grid gap-3 border-b px-4 py-3 last:border-b-0 md:border-b-0 md:border-r',
  'border-[var(--sniptale-color-border-soft)] md:[&:nth-child(2n)]:border-r-0',
].join(' ');

const requiredGrantIconClassName = [
  'flex h-8 w-8 flex-shrink-0 items-center justify-center',
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
      className="grid gap-5"
      aria-label={translate('settings.permissions.requiredGrantsTitle')}
    >
      <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.permissions.requiredGrantsDescription')}
      </p>
      {categoryOrder.map((category) => (
        <div key={category} className="grid gap-2.5">
          <h2 className={categoryHeadingClassName}>{translate(categoryTitleKeys[category])}</h2>
          <div
            className={[
              'grid overflow-hidden rounded-[12px] border md:grid-cols-2',
              'border-[var(--sniptale-color-border-soft)]',
            ].join(' ')}
          >
            {requiredManifestPermissionDisclosures
              .filter((disclosure) => disclosure.category === category)
              .map((disclosure) => (
                <RequiredManifestGrantCard key={disclosure.id} disclosure={disclosure} />
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
