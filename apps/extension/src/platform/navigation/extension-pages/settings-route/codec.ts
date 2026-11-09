export const SETTINGS_SECTION_IDS = [
  'interface-browser',
  'quick-actions',
  'screen-sizes',
  'media-quality',
  'saving',
  'annotations',
  'video-effects',
  'editor-resources',
  'scenario-layouts',
  'ai-connections',
  'ai-prompts',
  'voice-input',
  'native-app',
  'access-data',
  'events-logs',
  'settings-transfer',
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export const SETTINGS_SECTION_VIEWS = {
  'video-effects': [],
  'scenario-layouts': [],
  'interface-browser': ['interface', 'context-menu'],
  'quick-actions': [],
  'screen-sizes': [],
  'media-quality': ['image', 'video'],
  saving: ['settings', 'files', 'drafts', 'storage', 'templates', 'queue', 'connection'],
  annotations: ['borders', 'callouts', 'numbering', 'tags'],
  'editor-resources': ['tools', 'palettes', 'surfaces', 'gradients', 'backgrounds'],
  'ai-connections': ['integrations', 'chrome-ai'],
  'ai-prompts': ['templates', 'scenario-templates', 'prompts'],
  'voice-input': [],
  'native-app': ['connection'],
  'access-data': ['permissions', 'required-permissions', 'privacy', 'secret-protection'],
  'settings-transfer': [],
  'events-logs': [],
} as const satisfies Record<SettingsSectionId, readonly string[]>;

type SettingsRouteWithoutView = {
  section: SettingsSectionId;
  view?: never;
  queueFilter?: never;
};

/** Allowlisted queue presentation only; a route grants no sync command authority. */
export type SettingsQueueFilter = 'all' | 'problems' | 'action-required';

export type SettingsRoute =
  | SettingsRouteWithoutView
  | { section: 'interface-browser'; view?: 'interface' | 'context-menu' }
  | { section: 'media-quality'; view?: 'image' | 'video' }
  | {
      section: 'saving';
      view?: 'settings' | 'files' | 'drafts' | 'storage' | 'templates' | 'connection';
    }
  | {
      section: 'saving';
      view: 'queue';
      queueFilter?: SettingsQueueFilter;
    }
  | { section: 'annotations'; view?: 'borders' | 'callouts' | 'numbering' | 'tags' }
  | {
      section: 'editor-resources';
      view?: 'tools' | 'palettes' | 'surfaces' | 'gradients' | 'backgrounds';
    }
  | { section: 'ai-connections'; view?: 'integrations' | 'chrome-ai' }
  | { section: 'ai-prompts'; view?: 'templates' | 'scenario-templates' | 'prompts' }
  | { section: 'native-app'; view?: 'connection' }
  | {
      section: 'access-data';
      view?: 'permissions' | 'required-permissions' | 'privacy' | 'secret-protection';
    };

type SettingsRouteResolution = {
  normalizedUrl: URL;
  route: SettingsRoute;
  shouldReplace: boolean;
  source: 'canonical' | 'implicit-default' | 'invalid' | 'legacy';
};

const DEFAULT_SECTION = 'interface-browser' satisfies SettingsSectionId;
export type LegacySettingsSection =
  | 'appearance'
  | 'ai'
  | 'presets'
  | 'saves'
  | 'storage-drafts'
  | 'drafts'
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
  appearance: { section: 'interface-browser', view: 'interface' },
  ai: { section: 'ai-connections', view: 'integrations' },
  presets: { section: 'screen-sizes' },
  saves: { section: 'saving', view: 'settings' },
  'storage-drafts': { section: 'saving', view: 'drafts' },
  drafts: { section: 'saving', view: 'drafts' },
  highlighter: { section: 'annotations', view: 'borders' },
  editor: { section: 'editor-resources', view: 'tools' },
  image: { section: 'media-quality', view: 'image' },
  video: { section: 'media-quality', view: 'video' },
  quickactions: { section: 'quick-actions' },
  'voice-input': { section: 'voice-input' },
  'native-app': { section: 'native-app', view: 'connection' },
  'native-hotkeys': { section: 'native-app', view: 'connection' },
  'native-screenshots': { section: 'native-app', view: 'connection' },
  'native-video': { section: 'native-app', view: 'connection' },
  'native-telemetry': { section: 'native-app', view: 'connection' },
  templates: { section: 'ai-prompts', view: 'templates' },
  permissions: { section: 'access-data', view: 'permissions' },
  privacy: { section: 'access-data', view: 'privacy' },
};

function isSettingsSectionId(value: string | null): value is SettingsSectionId {
  return SETTINGS_SECTION_IDS.some((section) => section === value);
}

function isSettingsView(section: SettingsSectionId, value: string | null): boolean {
  return value !== null && SETTINGS_SECTION_VIEWS[section].some((view) => view === value);
}

function isSettingsQueueFilter(value: unknown): value is SettingsQueueFilter {
  return value === 'all' || value === 'problems' || value === 'action-required';
}

function normalizeRouteUrl(input: URL, route: SettingsRoute): URL {
  const normalized = new URL(input.toString());
  normalized.searchParams.delete('section');
  normalized.searchParams.delete('view');
  normalized.searchParams.delete('queueFilter');
  normalized.searchParams.set('section', route.section);
  if (route.view) normalized.searchParams.set('view', route.view);
  if (route.section === 'saving' && route.view === 'queue' && route.queueFilter !== undefined)
    normalized.searchParams.set('queueFilter', route.queueFilter);
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

function resolveCanonicalRoute(
  url: URL,
  section: SettingsSectionId,
  requestedView: string | null
): SettingsRouteResolution {
  const canonical = canonicalRoute(section, requestedView);
  let route = canonical.route;
  const filters = url.searchParams.getAll('queueFilter');
  const requestedFilter = filters[0];
  const queue = route.section === 'saving' && route.view === 'queue';
  const validFilter =
    filters.length === 0 ||
    (queue && filters.length === 1 && isSettingsQueueFilter(requestedFilter));
  if (
    route.section === 'saving' &&
    route.view === 'queue' &&
    filters.length === 1 &&
    isSettingsQueueFilter(requestedFilter)
  )
    route = { ...route, queueFilter: requestedFilter };
  const valid = canonical.valid && validFilter;
  return {
    normalizedUrl: valid ? url : normalizeRouteUrl(url, route),
    route,
    shouldReplace: !valid,
    source: valid ? 'canonical' : 'invalid',
  };
}

export function resolveSettingsRoute(input: URL | string): SettingsRouteResolution {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  const requestedSection = url.searchParams.get('section');
  const requestedView = url.searchParams.get('view');

  if (requestedSection === 'ai-connections' && requestedView === 'security') {
    const route = { section: 'access-data', view: 'secret-protection' } satisfies SettingsRoute;
    return {
      normalizedUrl: normalizeRouteUrl(url, route),
      route,
      shouldReplace: true,
      source: 'legacy',
    };
  }

  if (requestedSection === null && requestedView === null) {
    const orphanedFilter = url.searchParams.has('queueFilter');
    url.searchParams.delete('queueFilter');
    return {
      normalizedUrl: url,
      route: { section: DEFAULT_SECTION, view: 'interface' },
      shouldReplace: orphanedFilter,
      source: orphanedFilter ? 'invalid' : 'implicit-default',
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
    return resolveCanonicalRoute(url, requestedSection, requestedView);
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

  const fallback = { section: DEFAULT_SECTION, view: 'interface' } satisfies SettingsRoute;
  const normalizedUrl = new URL(url.toString());
  normalizedUrl.searchParams.delete('section');
  normalizedUrl.searchParams.delete('view');
  normalizedUrl.searchParams.delete('queueFilter');
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
  const queueFilter = 'queueFilter' in route ? route.queueFilter : undefined;
  if (
    queueFilter !== undefined &&
    (section !== 'saving' || view !== 'queue' || !isSettingsQueueFilter(queueFilter))
  )
    throw new Error('Invalid settings queue filter.');
  const canonical = canonicalRoute(section, view ?? null).route;
  const target =
    canonical.section === 'saving' &&
    canonical.view === 'queue' &&
    isSettingsQueueFilter(queueFilter)
      ? { ...canonical, queueFilter }
      : canonical;
  return normalizeRouteUrl(input instanceof URL ? input : new URL(input), target);
}

export function updateSettingsRouteView(route: SettingsRoute, view: string): SettingsRoute {
  if (!isSettingsView(route.section, view)) {
    throw new Error(`Invalid settings view "${view}" for section "${route.section}"`);
  }
  if (route.section === 'saving' && route.view === 'queue' && view === 'queue') return route;
  return { section: route.section, view } as SettingsRoute;
}
