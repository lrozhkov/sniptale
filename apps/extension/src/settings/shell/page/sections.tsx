import { lazy, type LazyExoticComponent, type ReactNode } from 'react';
import type {
  SettingsRoute,
  SettingsSectionId,
} from '../../../platform/navigation/extension-pages/settings-route/codec';
import { AppearanceSection } from '../../sections/general/interface-browser';
import { translate } from '../../../platform/i18n';
import { SettingsSectionHeader } from '../../section-surface';
import {
  DEFERRED_SETTINGS_SECTION_LOADERS,
  SETTINGS_NAV_ITEMS_BY_ID,
  type SettingsSectionModule,
} from '../navigation/registry';

type DeferredSettingsSection = Exclude<SettingsSectionId, 'interface-browser'>;
type DeferredSectionComponent = React.ComponentType<{
  onViewChange?: (view: string) => void;
  view?: string;
}>;

function createLazySettingsSection(
  loadModule: () => Promise<SettingsSectionModule>,
  exportName: string
): LazyExoticComponent<DeferredSectionComponent> {
  return lazy(async () => {
    const module = await loadModule();
    const component = module[exportName];
    if (!component) throw new Error(`Missing settings section export: ${exportName}`);
    return { default: component };
  });
}

const deferredSettingsSections = Object.fromEntries(
  Object.entries(DEFERRED_SETTINGS_SECTION_LOADERS).map(([section, descriptor]) => [
    section,
    createLazySettingsSection(descriptor.load, descriptor.exportName),
  ])
) as Record<DeferredSettingsSection, LazyExoticComponent<DeferredSectionComponent>>;

let deferredSettingsSectionsPreloadPromise: Promise<void> | null = null;

export function preloadDeferredSettingsSections(): Promise<void> {
  if (deferredSettingsSectionsPreloadPromise) return deferredSettingsSectionsPreloadPromise;
  deferredSettingsSectionsPreloadPromise = Promise.all(
    Object.values(DEFERRED_SETTINGS_SECTION_LOADERS).map((descriptor) => descriptor.load())
  )
    .then(() => undefined)
    .catch((error) => {
      deferredSettingsSectionsPreloadPromise = null;
      throw error;
    });
  return deferredSettingsSectionsPreloadPromise;
}

export function shouldDeferSettingsTab(
  section: SettingsSectionId
): section is DeferredSettingsSection {
  return section !== 'interface-browser';
}

export function renderSettingsRouteContent(
  route: SettingsRoute,
  onViewChange: (view: string) => void
): ReactNode {
  if (route.section === 'interface-browser') return <AppearanceSection />;
  const Section = deferredSettingsSections[route.section];
  return (
    <Section
      onViewChange={onViewChange}
      {...(route.view === undefined ? {} : { view: route.view })}
    />
  );
}

export function renderSettingsRouteHeader(section: SettingsSectionId): ReactNode {
  const item = SETTINGS_NAV_ITEMS_BY_ID[section];
  return (
    <SettingsSectionHeader
      kicker={translate(item.label)}
      description={translate(item.description)}
    />
  );
}
