import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { AppearanceSection } from '../../sections/appearance';
import { isSettingsTabVisible, normalizeSettingsTab, type SettingsTab } from '../navigation';

type SettingsSectionComponent = ComponentType;
type DeferredSettingsTab = Exclude<SettingsTab, 'appearance'>;
type SettingsSectionLoader = () => Promise<Record<string, SettingsSectionComponent>>;

function createLazySettingsSection(
  loadModule: SettingsSectionLoader,
  exportName: string
): LazyExoticComponent<SettingsSectionComponent> {
  return lazy(async () => {
    const module = await loadModule();
    const component = module[exportName];
    if (!component) {
      throw new Error(`Missing settings section export: ${exportName}`);
    }

    return { default: component };
  });
}

const deferredSettingsSectionLoaders: Record<DeferredSettingsTab, SettingsSectionLoader> = {
  ai: () => import('../../sections/ai-providers'),
  presets: () => import('../../sections/viewport-presets'),
  saves: () => import('../../sections/save-presets'),
  highlighter: () => import('../../sections/highlighter/section'),
  editor: () => import('../../sections/editor'),
  image: () => import('../../sections/image'),
  pageStyles: () => import('../../sections/page-styles'),
  templates: () => import('../../sections/templates'),
  quickactions: () => import('../../sections/quick-actions'),
  nativeApp: () => import('../../sections/native-app'),
  permissions: () => import('../../sections/permissions'),
  privacy: () => import('../../sections/privacy'),
};

const deferredSettingsSections: Record<
  DeferredSettingsTab,
  LazyExoticComponent<SettingsSectionComponent>
> = {
  ai: createLazySettingsSection(deferredSettingsSectionLoaders.ai, 'AIProvidersSection'),
  presets: createLazySettingsSection(deferredSettingsSectionLoaders.presets, 'PresetsSection'),
  saves: createLazySettingsSection(deferredSettingsSectionLoaders.saves, 'SavePresetsSection'),
  highlighter: createLazySettingsSection(
    deferredSettingsSectionLoaders.highlighter,
    'HighlighterSection'
  ),
  editor: createLazySettingsSection(deferredSettingsSectionLoaders.editor, 'EditorSection'),
  image: createLazySettingsSection(deferredSettingsSectionLoaders.image, 'ImageSettingsSection'),
  pageStyles: createLazySettingsSection(
    deferredSettingsSectionLoaders.pageStyles,
    'PageStylesSection'
  ),
  templates: createLazySettingsSection(
    deferredSettingsSectionLoaders.templates,
    'TemplatesSection'
  ),
  quickactions: createLazySettingsSection(
    deferredSettingsSectionLoaders.quickactions,
    'QuickActionsSection'
  ),
  nativeApp: createLazySettingsSection(
    deferredSettingsSectionLoaders.nativeApp,
    'NativeAppSection'
  ),
  permissions: createLazySettingsSection(
    deferredSettingsSectionLoaders.permissions,
    'PermissionsSection'
  ),
  privacy: createLazySettingsSection(deferredSettingsSectionLoaders.privacy, 'PrivacySection'),
};

let deferredSettingsSectionsPreloadPromise: Promise<void> | null = null;

export function preloadDeferredSettingsSections(): Promise<void> {
  if (deferredSettingsSectionsPreloadPromise) {
    return deferredSettingsSectionsPreloadPromise;
  }

  deferredSettingsSectionsPreloadPromise = Promise.all(
    Object.entries(deferredSettingsSectionLoaders)
      .filter(([tab]) => isSettingsTabVisible(tab as SettingsTab))
      .map(([, loadModule]) => loadModule())
  )
    .then(() => undefined)
    .catch((error) => {
      deferredSettingsSectionsPreloadPromise = null;
      throw error;
    });

  return deferredSettingsSectionsPreloadPromise;
}

export function shouldDeferSettingsTab(tab: SettingsTab): tab is DeferredSettingsTab {
  return tab !== 'appearance' && isSettingsTabVisible(tab);
}

export function renderSettingsTabContent(activeTab: SettingsTab): ReactNode {
  const visibleTab = normalizeSettingsTab(activeTab);
  if (visibleTab === 'appearance') {
    return <AppearanceSection />;
  }

  const Section = deferredSettingsSections[visibleTab];
  return <Section />;
}
