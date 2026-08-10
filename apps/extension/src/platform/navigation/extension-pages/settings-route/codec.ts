export const SETTINGS_SECTION_IDS = [
  'interface-browser',
  'quick-actions',
  'screen-sizes',
  'media-quality',
  'saving',
  'storage-drafts',
  'annotations',
  'editor-resources',
  'ai-connections',
  'ai-prompts',
  'voice-input',
  'native-app',
  'access-data',
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export const SETTINGS_SECTION_VIEWS = {
  'interface-browser': [],
  'quick-actions': [],
  'screen-sizes': [],
  'media-quality': ['image', 'video'],
  saving: [],
  'storage-drafts': [],
  annotations: ['borders', 'callouts', 'numbering'],
  'editor-resources': ['tools', 'palettes'],
  'ai-connections': [],
  'ai-prompts': [],
  'voice-input': [],
  'native-app': ['connection', 'capture', 'commands', 'telemetry'],
  'access-data': ['permissions', 'privacy'],
} as const satisfies Record<SettingsSectionId, readonly string[]>;

type SettingsRouteWithoutView = {
  section:
    | 'interface-browser'
    | 'quick-actions'
    | 'screen-sizes'
    | 'saving'
    | 'storage-drafts'
    | 'ai-connections'
    | 'ai-prompts'
    | 'voice-input';
  view?: never;
};

export type SettingsRoute =
  | SettingsRouteWithoutView
  | { section: 'media-quality'; view?: 'image' | 'video' }
  | { section: 'annotations'; view?: 'borders' | 'callouts' | 'numbering' }
  | { section: 'editor-resources'; view?: 'tools' | 'palettes' }
  | { section: 'native-app'; view?: 'connection' | 'capture' | 'commands' | 'telemetry' }
  | { section: 'access-data'; view?: 'permissions' | 'privacy' };

type SettingsRouteResolution = {
  normalizedUrl: URL;
  route: SettingsRoute;
  shouldReplace: boolean;
  source: 'canonical' | 'implicit-default' | 'invalid' | 'legacy';
};

const DEFAULT_SECTION: SettingsSectionId = 'interface-browser';
export type LegacySettingsSection =
  | 'appearance'
  | 'ai'
  | 'presets'
  | 'saves'
  | 'highlighter'
  | 'editor'
  | 'image'
  | 'video'
  | 'quickactions'
  | 'voice-input'
  | 'native-app'
  | 'native-hotkeys'
  | 'native-screenshots'
  | 'native-video'
  | 'native-telemetry'
  | 'templates'
  | 'permissions'
  | 'privacy';

const LEGACY_ROUTES: Readonly<Record<LegacySettingsSection, SettingsRoute>> = {
  appearance: { section: 'interface-browser' },
  ai: { section: 'ai-connections' },
  presets: { section: 'screen-sizes' },
  saves: { section: 'saving' },
  highlighter: { section: 'annotations', view: 'borders' },
  editor: { section: 'editor-resources', view: 'tools' },
  image: { section: 'media-quality', view: 'image' },
  video: { section: 'media-quality', view: 'video' },
  quickactions: { section: 'quick-actions' },
  'voice-input': { section: 'voice-input' },
  'native-app': { section: 'native-app', view: 'connection' },
  'native-hotkeys': { section: 'native-app', view: 'commands' },
  'native-screenshots': { section: 'native-app', view: 'capture' },
  'native-video': { section: 'native-app', view: 'capture' },
  'native-telemetry': { section: 'native-app', view: 'telemetry' },
  templates: { section: 'ai-prompts' },
  permissions: { section: 'access-data', view: 'permissions' },
  privacy: { section: 'access-data', view: 'privacy' },
};

function isSettingsSectionId(value: string | null): value is SettingsSectionId {
  return SETTINGS_SECTION_IDS.some((section) => section === value);
}

function isSettingsView(section: SettingsSectionId, value: string | null): boolean {
  return value !== null && SETTINGS_SECTION_VIEWS[section].some((view) => view === value);
}

function normalizeRouteUrl(input: URL, route: SettingsRoute): URL {
  const normalized = new URL(input.toString());
  normalized.searchParams.delete('section');
  normalized.searchParams.delete('view');
  normalized.searchParams.set('section', route.section);
  if (route.view) normalized.searchParams.set('view', route.view);
  return normalized;
}

function canonicalRoute(
  section: SettingsSectionId,
  requestedView: string | null
): { route: SettingsRoute; valid: boolean } {
  const views = SETTINGS_SECTION_VIEWS[section];
  if (views.length === 0) {
    return {
      route: { section } as SettingsRoute,
      valid: requestedView === null,
    };
  }
  if (requestedView === null) {
    return {
      route: { section, view: views[0] } as SettingsRoute,
      valid: true,
    };
  }
  return {
    route: {
      section,
      view: isSettingsView(section, requestedView) ? requestedView : views[0],
    } as SettingsRoute,
    valid: isSettingsView(section, requestedView),
  };
}

export function resolveSettingsRoute(input: URL | string): SettingsRouteResolution {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  const requestedSection = url.searchParams.get('section');
  const requestedView = url.searchParams.get('view');

  if (requestedSection === null && requestedView === null) {
    return {
      normalizedUrl: url,
      route: { section: DEFAULT_SECTION },
      shouldReplace: false,
      source: 'implicit-default',
    };
  }

  if (
    (requestedSection === 'native-app' || requestedSection === 'voice-input') &&
    requestedView === null
  ) {
    const legacyNativeRoute = LEGACY_ROUTES[requestedSection];
    return {
      normalizedUrl: normalizeRouteUrl(url, legacyNativeRoute),
      route: legacyNativeRoute,
      shouldReplace: true,
      source: 'legacy',
    };
  }

  if (isSettingsSectionId(requestedSection)) {
    const canonical = canonicalRoute(requestedSection, requestedView);
    return {
      normalizedUrl: canonical.valid ? url : normalizeRouteUrl(url, canonical.route),
      route: canonical.route,
      shouldReplace: !canonical.valid,
      source: canonical.valid ? 'canonical' : 'invalid',
    };
  }

  const legacy =
    requestedSection && requestedSection in LEGACY_ROUTES
      ? LEGACY_ROUTES[requestedSection as LegacySettingsSection]
      : undefined;
  if (legacy) {
    return {
      normalizedUrl: normalizeRouteUrl(url, legacy),
      route: legacy,
      shouldReplace: true,
      source: 'legacy',
    };
  }

  const fallback = { section: DEFAULT_SECTION } satisfies SettingsRoute;
  const normalizedUrl = new URL(url.toString());
  normalizedUrl.searchParams.delete('section');
  normalizedUrl.searchParams.delete('view');
  return {
    normalizedUrl,
    route: fallback,
    shouldReplace: true,
    source: 'invalid',
  };
}

export function buildSettingsRouteUrl(input: URL | string, route: SettingsRoute): URL {
  const section = route.section;
  const view = route.view;
  if (view !== undefined && !isSettingsView(section, view)) {
    throw new Error(`Invalid settings view "${view}" for section "${section}"`);
  }
  const canonical = canonicalRoute(section, view ?? null).route;
  return normalizeRouteUrl(input instanceof URL ? input : new URL(input), canonical);
}

export function updateSettingsRouteView(route: SettingsRoute, view: string): SettingsRoute {
  if (!isSettingsView(route.section, view)) {
    throw new Error(`Invalid settings view "${view}" for section "${route.section}"`);
  }
  return { section: route.section, view } as SettingsRoute;
}
