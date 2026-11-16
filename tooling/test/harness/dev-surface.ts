import type { SniptaleHarnessBootstrap } from './browser-mocks/browser-mocks.types';
import { prepareTranslations } from '../../../apps/extension/src/platform/i18n';
import type { CatalogProfile } from '../../../apps/extension/src/platform/i18n/catalog-profiles';

const profiles = [
  'video-editor',
  'image-editor',
  'gallery-editor',
  'popup',
  'settings',
  'library',
  'scenario-editor',
  'components',
  'image-inspector',
  'audio-preview',
] as const;
type Profile = (typeof profiles)[number];
type Candidate = {
  id: string;
  width: number | null;
  height: number | null;
  backupRootKey?: string;
  review?: { revision: number; createdAt: number; sourceAssetId: string };
};
type Inventory = {
  image: Candidate[];
  gallery: Candidate[];
  video: Candidate[];
  scenario: Candidate[];
};
type Imported = { image: string[]; gallery: string[]; video: string[]; scenario: string[] };
export interface DevSurfaceConfig {
  profile: Profile;
  id: string | null;
  locale: 'en' | 'ru';
  theme: 'light' | 'dark' | 'system';
  fixtureUrl: string | null;
  fixtureDigest: string | null;
}
interface SurfacePorts {
  prepareAdapters(config: DevSurfaceConfig): Promise<void>;
  prepareCatalogs(config: DevSurfaceConfig): Promise<void>;
  readInventory(): Promise<Inventory>;
  restoreFixture(config: DevSurfaceConfig): Promise<readonly string[]>;
  readImported(digest: string): Imported | null;
  writeImported(digest: string, imported: Imported): void;
  setPage(profile: Profile, selected: Candidate | null): void;
  mount(profile: Profile): Promise<void>;
}
interface SurfaceStatus {
  status: 'preparing' | 'ready' | 'error';
  profile: Profile | null;
  selectedId: string | null;
  composition: { width: number; height: number } | null;
  error: string | null;
}
declare global {
  interface Window {
    __sniptaleDevSurface?: SurfaceStatus;
  }
}
class SurfacePreparationError extends Error {}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function profileName(value: unknown): Profile {
  for (const name of profiles) if (value === name) return name;
  throw new SurfacePreparationError('The requested development surface is unsupported.');
}
function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length > 1024 ||
    !value ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw new SurfacePreparationError('Development surface configuration is invalid.');
  return value;
}
/** Resolve the production route before requesting runtime configuration. */
export function devSurfaceProfileFromUrl(url: URL): Profile | null {
  const explicit = url.searchParams.get('profile') ?? url.searchParams.get('surface');
  if (explicit !== null) return profileName(explicit);
  if (url.pathname.includes('/video-editor/')) return 'video-editor';
  if (url.pathname.includes('/scenario-editor/')) return 'scenario-editor';
  if (url.pathname.includes('/design-system/')) return 'components';
  if (url.pathname === '/tooling/test/harness/editor.html') return 'image-inspector';
  if (url.pathname.includes('/preview-audio-diagnostic.html')) return 'audio-preview';
  if (url.pathname.includes('/editor/')) return 'image-editor';
  if (url.pathname.includes('/gallery/'))
    return url.searchParams.get('mode') === 'edit' ? 'gallery-editor' : 'library';
  if (url.pathname.includes('/settings/')) return 'settings';
  if (url.pathname.includes('/popup/')) return 'popup';
  return null;
}
/** Admit only browser configuration and a same-origin, fixed fixture endpoint. */
export function parseDevSurfaceConfig(value: unknown, url: URL): DevSurfaceConfig {
  if (!record(value))
    throw new SurfacePreparationError('Development surface configuration is invalid.');
  const profile = devSurfaceProfileFromUrl(url) ?? profileName(value['profile']);
  const locale = url.searchParams.get('locale') ?? value['locale'] ?? 'en';
  const theme = url.searchParams.get('theme') ?? value['theme'] ?? 'system';
  if (
    (locale !== 'en' && locale !== 'ru') ||
    (theme !== 'light' && theme !== 'dark' && theme !== 'system')
  )
    throw new SurfacePreparationError('Development surface locale or theme is unsupported.');
  const identityParameter =
    profile === 'video-editor'
      ? 'project'
      : profile === 'image-editor'
        ? 'assetId'
        : profile === 'gallery-editor'
          ? 'mediaId'
          : 'projectId';
  const id = optionalText(
    url.searchParams.get(identityParameter) ??
      (profile === 'video-editor' ? url.searchParams.get('review') : null) ??
      url.searchParams.get('id') ??
      value['id']
  );
  const fixtureUrl = optionalText(value['fixtureUrl']);
  const fixtureDigest = optionalText(value['fixtureDigest']);
  if (
    (fixtureUrl === null) !== (fixtureDigest === null) ||
    (fixtureUrl !== null && fixtureUrl !== '/__dev_surface/fixture')
  )
    throw new SurfacePreparationError('Development fixture configuration is invalid.');
  if (fixtureDigest !== null && !/^(?:sha256:)?[a-f0-9]{64}$/u.test(fixtureDigest))
    throw new SurfacePreparationError('Development fixture identity is invalid.');
  return { profile, id, locale, theme, fixtureUrl, fixtureDigest };
}
function groupFor(profile: Profile): keyof Inventory | null {
  if (profile === 'image-editor') return 'image';
  if (profile === 'video-editor') return 'video';
  if (profile === 'gallery-editor') return 'gallery';
  if (profile === 'scenario-editor') return 'scenario';
  return null;
}
/** Prepare adapters and the complete archive before selecting or importing a production page. */
export async function prepareDevSurface(config: DevSurfaceConfig, ports: SurfacePorts) {
  await ports.prepareAdapters(config);
  await ports.prepareCatalogs(config);
  let imported = config.fixtureDigest ? ports.readImported(config.fixtureDigest) : null;
  let inventory: Inventory;
  if (config.fixtureUrl && config.fixtureDigest && !imported) {
    const restoredRoots = await ports.restoreFixture(config);
    inventory = await ports.readInventory();
    const added = (group: keyof Inventory) =>
      inventory[group]
        .filter(
          (item) => item.backupRootKey !== undefined && restoredRoots.includes(item.backupRootKey)
        )
        .map((item) => item.id);
    imported = {
      image: added('image'),
      gallery: added('gallery'),
      video: added('video'),
      scenario: added('scenario'),
    };
    ports.writeImported(config.fixtureDigest, imported);
  } else inventory = await ports.readInventory();
  const group = groupFor(config.profile);
  if (!group && config.id)
    throw new SurfacePreparationError('This surface does not select a stored identity.');
  const candidates = group
    ? [...inventory[group]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    : [];
  const preferred =
    group && imported ? candidates.filter((item) => imported[group].includes(item.id)) : candidates;
  const selected = config.id ? candidates.find((item) => item.id === config.id) : preferred[0];
  if (config.id && !selected)
    throw new SurfacePreparationError(
      'The requested identity is unavailable for this development surface.'
    );
  if (config.fixtureUrl && group && !selected)
    throw new SurfacePreparationError(
      'The supplied archive contains no suitable root for this development surface.'
    );
  ports.setPage(config.profile, selected ?? null);
  await ports.mount(config.profile);
  return {
    selectedId: selected?.id ?? null,
    composition:
      selected?.width && selected.height
        ? { width: selected.width, height: selected.height }
        : null,
  };
}
async function prepareAdapters(config: DevSurfaceConfig) {
  const storage = {
    'sniptale-locale-preference': config.locale,
    'sniptale-theme-preference': config.theme,
  };
  const bootstrap: SniptaleHarnessBootstrap = {
    preserveMediaLibrary: true,
    storage,
    apiBehavior: { runtimeFallback: 'typed-success' },
  };
  window.__sniptaleHarnessBootstrap = bootstrap;
  for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  document.documentElement.lang = config.locale;
  document.documentElement.dataset['locale'] = config.locale;
  document.documentElement.dataset['theme'] =
    config.theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : config.theme;
  document.documentElement.style.colorScheme = document.documentElement.dataset['theme'];
  const { harnessReady } = await import('./browser-mocks/browser-mocks');
  await harnessReady;
}
async function prepareCatalogs(config: DevSurfaceConfig): Promise<void> {
  const catalogProfiles: Record<Profile, CatalogProfile | null> = {
    'video-editor': 'video-editor',
    'image-editor': 'editor',
    'gallery-editor': 'gallery',
    popup: 'popup',
    settings: 'settings',
    library: 'gallery',
    'scenario-editor': 'scenario-editor',
    components: 'design-system',
    'image-inspector': 'editor',
    'audio-preview': null,
  };
  const profile = catalogProfiles[config.profile];
  if (profile) await prepareTranslations(profile);
}
async function readInventory(): Promise<Inventory> {
  const [
    { listMediaLibrary },
    { listVideoProjectEntries },
    { listScenarioProjectSummaries },
    { listVideoWorkspaceSummaries },
    { readVideoWorkspace },
  ] = await Promise.all([
    import('../../../apps/extension/src/composition/persistence/media-library'),
    import('../../../apps/extension/src/composition/persistence/projects'),
    import('../../../apps/extension/src/composition/persistence/scenario/store/public'),
    import('../../../apps/extension/src/composition/persistence/review-workspaces/summaries'),
    import('../../../apps/extension/src/composition/persistence/review-workspaces/store'),
  ]);
  const [media, projects, scenarios, reviews] = await Promise.all([
    listMediaLibrary(),
    listVideoProjectEntries(),
    listScenarioProjectSummaries(),
    listVideoWorkspaceSummaries(),
  ]);
  const visibleMedia = media.filter((item) => item.lifecycle?.trashedAt === undefined);
  const gallery: Candidate[] = [];
  const reviewProjects: Candidate[] = [];
  for (const item of reviews) {
    if (item.lifecycle.trashedAt !== undefined || item.unavailableReason || !item.source) continue;
    const snapshot = await readVideoWorkspace(item.aggregateId).catch((error: unknown) => {
      if (error instanceof Error && 'diagnostic' in error)
        console.error('[dev-surface] Workspace admission:', JSON.stringify(error.diagnostic));
      throw error;
    });
    if (!snapshot) continue;
    const workspace = snapshot.workspace;
    const candidate = {
      id: item.aggregateId,
      width: item.source.width,
      height: item.source.height,
      backupRootKey: `media:library-item:${workspace.sourceMediaId ?? workspace.aggregateId}`,
    };
    gallery.push(candidate);
    reviewProjects.push({
      ...candidate,
      review: {
        revision: workspace.revision,
        createdAt: workspace.createdAt,
        sourceAssetId: workspace.sourceAssetId,
      },
    });
  }
  for (const item of visibleMedia.filter((item) => item.mimeType.startsWith('video/')))
    if (!gallery.some((candidate) => candidate.id === item.id))
      gallery.push({
        id: item.id,
        width: item.width,
        height: item.height,
        backupRootKey: `media:library-item:${item.id}`,
      });
  return {
    image: visibleMedia
      .filter((item) => item.mimeType.startsWith('image/'))
      .map(({ id, width, height }) => ({
        id,
        width,
        height,
        backupRootKey: `media:library-item:${id}`,
      })),
    gallery,
    video: [
      ...projects
        .filter((item) => item.lifecycle?.trashedAt === undefined)
        .map((item) => ({
          id: item.id,
          width: item.project.width,
          height: item.project.height,
          backupRootKey: `video-project:${item.id}`,
        })),
      ...reviewProjects,
    ],
    scenario: scenarios
      .filter(
        (item) => item.availability === 'available' && item.lifecycle?.trashedAt === undefined
      )
      .map(({ id }) => ({
        id,
        width: null,
        height: null,
        backupRootKey: `scenario-project:${id}`,
      })),
  };
}
/** Bind imported bytes to the server's declared fixture identity before any mutation. */
export async function verifyDevSurfaceFixtureDigest(blob: Blob, digest: string): Promise<void> {
  const actual = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
  if (actual !== digest.replace(/^sha256:/u, ''))
    throw new SurfacePreparationError(
      'The development fixture changed. Restart the server before importing it.'
    );
}
async function restoreFixture(config: DevSurfaceConfig): Promise<readonly string[]> {
  if (!config.fixtureUrl || !config.fixtureDigest) return [];
  const response = await fetch(config.fixtureUrl);
  if (!response.ok)
    throw new SurfacePreparationError('The configured development fixture is unavailable.');
  const blob = await response.blob();
  await verifyDevSurfaceFixtureDigest(blob, config.fixtureDigest);
  const [{ importMediaHubBackup, MediaBackupFailure }, { readArchiveRestoreSession }] =
    await Promise.all([
      import('../../../apps/extension/src/workflows/media-hub-backup'),
      import('../../../apps/extension/src/composition/persistence/assets'),
    ]);
  const result = await importMediaHubBackup(blob, 'skip').catch((error: unknown) => {
    const category =
      error instanceof MediaBackupFailure
        ? `${error.phase}:${error.reason}`
        : error instanceof Error && error.name === 'AbortError'
          ? 'archive-import-aborted'
          : 'archive-import-failed';
    throw new SurfacePreparationError(`${category}: Existing local data remains available.`);
  });
  const session = await readArchiveRestoreSession(result.operationId);
  if (!session || session.status !== 'completed')
    throw new SurfacePreparationError(
      'Development fixture import did not complete. Existing local data remains available.'
    );
  return session.committedRoots;
}
function readImported(digest: string): Imported | null {
  const raw = localStorage.getItem(`sniptale-dev-surface-fixture:${digest}`);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value)) return null;
    const strings = (candidate: unknown): candidate is string[] =>
      Array.isArray(candidate) && candidate.every((id) => typeof id === 'string');
    return strings(value['image']) &&
      strings(value['gallery']) &&
      strings(value['video']) &&
      strings(value['scenario'])
      ? {
          image: value['image'],
          gallery: value['gallery'],
          video: value['video'],
          scenario: value['scenario'],
        }
      : null;
  } catch {
    return null;
  }
}
function setPage(profile: Profile, selected: Candidate | null) {
  const url = new URL(location.href);
  url.searchParams.delete('id');
  const key =
    profile === 'video-editor'
      ? 'project'
      : profile === 'image-editor'
        ? 'assetId'
        : profile === 'gallery-editor'
          ? 'mediaId'
          : profile === 'scenario-editor'
            ? 'projectId'
            : null;
  if (profile === 'video-editor' && selected?.review) {
    url.searchParams.delete('project');
    url.searchParams.set('review', selected.id);
    url.searchParams.set('reviewRevision', String(selected.review.revision));
    url.searchParams.set('reviewCreatedAt', String(selected.review.createdAt));
    url.searchParams.set('reviewSourceAssetId', selected.review.sourceAssetId);
  } else if (key && selected) {
    url.searchParams.set(key, selected.id);
    if (profile === 'video-editor')
      for (const parameter of [
        'review',
        'reviewRevision',
        'reviewCreatedAt',
        'reviewSourceAssetId',
      ])
        url.searchParams.delete(parameter);
  }
  if (profile === 'gallery-editor') url.searchParams.set('mode', 'edit');
  if (profile === 'library')
    for (const parameter of ['mode', 'mediaId', 'recordingId']) url.searchParams.delete(parameter);
  history.replaceState(history.state, '', url);
}
async function mount(profile: Profile) {
  switch (profile) {
    case 'image-editor':
      await import('../../../apps/extension/src/editor/index');
      break;
    case 'video-editor':
      await import('../../../apps/extension/src/video-editor/index');
      break;
    case 'gallery-editor':
    case 'library':
      await import('../../../apps/extension/src/gallery/index');
      break;
    case 'settings':
      await import('../../../apps/extension/src/settings/index');
      break;
    case 'scenario-editor':
      await import('../../../apps/extension/src/scenario-editor/index');
      break;
    case 'components':
      await import('../../../apps/extension/src/design-system/index');
      break;
    case 'image-inspector':
      await import('./editor');
      break;
    case 'popup':
      await import('../../../apps/extension/src/popup/shell/app/startup.css');
      await import('../../../apps/extension/src/popup/index');
      break;
    case 'audio-preview': {
      const root = document.getElementById('root')!;
      const button = document.createElement('button');
      button.id = 'run-preview-audio-diagnostic';
      button.type = 'button';
      button.textContent = 'Run preview audio diagnostic';
      const output = document.createElement('pre');
      output.id = 'preview-audio-diagnostic-output';
      output.setAttribute('aria-live', 'polite');
      root.replaceChildren(button, output);
      await import('./preview-audio-diagnostic');
      break;
    }
  }
}
/** The browser exposes only safe preparation status to local diagnostics. */
export async function startDevSurface() {
  const status: SurfaceStatus = {
    status: 'preparing',
    profile: null,
    selectedId: null,
    composition: null,
    error: null,
  };
  window.__sniptaleDevSurface = status;
  const feedback = document.getElementById('dev-surface-status');
  try {
    const url = new URL(location.href);
    const requested = devSurfaceProfileFromUrl(url);
    const response = await fetch(
      `/__dev_surface/config${requested ? `?profile=${encodeURIComponent(requested)}` : ''}`
    );
    if (!response.ok)
      throw new SurfacePreparationError('Development surface configuration is unavailable.');
    const payload: unknown = await response.json();
    const config = parseDevSurfaceConfig(payload, url);
    status.profile = config.profile;
    const prepared = await prepareDevSurface(config, {
      prepareAdapters,
      prepareCatalogs,
      readInventory,
      restoreFixture,
      readImported,
      writeImported: (digest, imported) =>
        localStorage.setItem(`sniptale-dev-surface-fixture:${digest}`, JSON.stringify(imported)),
      setPage,
      mount,
    });
    Object.assign(status, prepared, { status: 'ready' });
    console.info('[dev-surface] Preparation ready.');
    if (config.profile === 'video-editor') {
      const { useVideoEditorStore } =
        await import('../../../apps/extension/src/video-editor/state/store');
      const update = () => {
        const project = useVideoEditorStore.getState().project;
        if (project) {
          status.selectedId = project.id;
          status.composition = { width: project.width, height: project.height };
        }
      };
      update();
      const unsubscribe = useVideoEditorStore.subscribe(update);
      import.meta.hot?.dispose(unsubscribe);
    }
    if (feedback) feedback.hidden = true;
  } catch (error) {
    console.error('[dev-surface] Preparation failed:', error);
    status.status = 'error';
    status.error =
      error instanceof SurfacePreparationError
        ? error.message
        : 'Development surface preparation failed. Existing local data remains available.';
    if (feedback) {
      feedback.hidden = false;
      feedback.textContent = status.error;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Reload development surface';
      retry.style.marginInlineStart = '12px';
      retry.addEventListener('click', () => location.reload());
      feedback.append(retry);
    }
  }
}
if (
  typeof document !== 'undefined' &&
  document.documentElement.hasAttribute('data-sniptale-dev-surface')
)
  void startDevSurface();
