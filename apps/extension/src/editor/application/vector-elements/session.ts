import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import type { EditorVectorLibrary } from '../../../composition/persistence/vector-elements/library';
import type { createEditorVectorDownloads } from '../../../composition/persistence/vector-elements/downloads';
import type {
  createEditorVectorCache,
  EditorVectorCacheUsage,
} from '../../../composition/persistence/vector-elements/cache';
import type {
  EditorVectorSettings,
  EditorVectorPreset,
  EditorVectorDownload,
} from '../../../composition/persistence/vector-elements/contracts';
import {
  EditorVectorCatalogError,
  type CatalogErrorCode,
  type EditorVectorSourceToken,
} from '../../../features/editor/vector-catalog';
import { EditorVectorCatalogPreparation } from './catalog-preparation';
import { EditorVectorDownloadJob } from './download-job';
import { authorizeEditorVectorSource } from './source-commands';
import { importEditorVectorFiles } from './import-commands';

export interface EditorVectorCatalogPort {
  collections(signal?: AbortSignal): Promise<{ source: EditorVectorSourceToken; data: unknown }>;
  search(
    input: { query: string; prefix?: string; start?: number; limit?: number },
    signal?: AbortSignal
  ): Promise<{ source: EditorVectorSourceToken; data: unknown }>;
  collection(
    prefix: string,
    signal?: AbortSignal
  ): Promise<{ source: EditorVectorSourceToken; data: unknown }>;
  assets(
    prefix: string,
    names: readonly string[],
    signal?: AbortSignal
  ): Promise<{ source: EditorVectorSourceToken; data: unknown }>;
  check(signal?: AbortSignal): Promise<unknown>;
}
export interface EditorVectorCatalogEntry {
  key: string;
  name: string;
  prefix: string | null;
  definition: EditorVectorDefinition | null;
  favorite: boolean;
  local: boolean;
  imported: boolean;
  issue: boolean;
}
export type EditorVectorLibraryTab = 'catalog' | 'favorites' | 'mine';
export interface EditorVectorLibrarySnapshot {
  query: string;
  tab: EditorVectorLibraryTab;
  collection: string;
  selectedKey: string | null;
  entries: EditorVectorCatalogEntry[];
  settings: EditorVectorSettings | null;
  local: Awaited<ReturnType<EditorVectorLibrary['readCatalog']>>;
  remoteCollections: { prefix: string; name: string }[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: boolean;
  errorCode: CatalogErrorCode | 'operation-failed' | null;
  retryAt: number | null;
  busy: boolean;
  scrollTop: number;
  visibleCount: number;
  imports: { name: string; accepted: number; declined: number }[];
  download: {
    prefix: string;
    accepted: number;
    total: number;
    status: 'downloading' | 'partial' | 'ready' | 'error';
  } | null;
  connected: boolean;
  hasMore: boolean;
  remoteStart: number;
  downloads: EditorVectorDownload[];
  cacheUsage: EditorVectorCacheUsage | null;
}

interface SessionDependencies {
  library: EditorVectorLibrary;
  downloads: ReturnType<typeof createEditorVectorDownloads>;
  cache: ReturnType<typeof createEditorVectorCache>;
  catalog: EditorVectorCatalogPort;
  requestPermission(baseUrl: string): Promise<boolean>;
}
function initialSnapshot(): EditorVectorLibrarySnapshot {
  return {
    query: '',
    tab: 'catalog',
    collection: '',
    selectedKey: null,
    entries: [],
    settings: null,
    local: { items: [], collections: [], members: [], presets: [] },
    remoteCollections: [],
    status: 'idle',
    error: false,
    errorCode: null,
    retryAt: null,
    busy: false,
    scrollTop: 0,
    visibleCount: 128,
    imports: [],
    download: null,
    connected: false,
    hasMore: false,
    remoteStart: 0,
    downloads: [],
    cacheUsage: null,
  };
}

/** The mounted editor owns one view snapshot and every search/cache-statistics publication fence. */
class MountedVectorLibrarySession {
  private state = initialSnapshot();
  private readonly listeners = new Set<() => void>();
  readonly definitions = new Map<string, EditorVectorDefinition>();
  private disposed = false;
  private revision = 0;
  private cacheUsageRevision = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | null = null;
  private preparation!: EditorVectorCatalogPreparation;
  private download!: EditorVectorDownloadJob;
  constructor(private readonly dependencies: SessionDependencies) {}
  connect(preparation: EditorVectorCatalogPreparation, download: EditorVectorDownloadJob) {
    this.preparation = preparation;
    this.download = download;
  }
  isAlive = () => !this.disposed;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(patch: Partial<EditorVectorLibrarySnapshot>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  failure = (error: unknown, patch: Partial<EditorVectorLibrarySnapshot> = {}) => {
    const errorCode = error instanceof EditorVectorCatalogError ? error.code : 'operation-failed';
    const retryAt =
      error instanceof EditorVectorCatalogError && error.retryAfterSeconds !== undefined
        ? Date.now() + error.retryAfterSeconds * 1000
        : this.state.retryAt;
    this.emit({ ...patch, error: true, errorCode, retryAt });
  };
  admitNetwork = () => {
    if (this.state.retryAt !== null && Date.now() < this.state.retryAt)
      throw new EditorVectorCatalogError(
        'rate-limited',
        Math.ceil((this.state.retryAt - Date.now()) / 1000)
      );
  };
  private cancelSearch() {
    this.revision++;
    clearTimeout(this.searchTimer);
    this.request?.abort();
    this.request = null;
  }
  currentSource = (source: EditorVectorSourceToken) =>
    Boolean(
      this.state.settings?.networkEnabled &&
      this.state.settings.disclosureAccepted &&
      this.state.settings.baseUrl === source.sourceId &&
      this.state.settings.incarnation === source.incarnation &&
      this.state.settings.sourceGeneration === source.generation
    );
  sourceToken = (): EditorVectorSourceToken => {
    const settings = this.state.settings;
    if (!settings?.networkEnabled || !settings.disclosureAccepted)
      throw new Error('Vector catalog is disabled.');
    return {
      sourceId: settings.baseUrl,
      incarnation: settings.incarnation,
      generation: settings.sourceGeneration,
    };
  };
  collectionName = (prefix: string) =>
    this.state.remoteCollections.find((row) => row.prefix === prefix)?.name ?? prefix;
  downloadProgress = (download: NonNullable<EditorVectorLibrarySnapshot['download']>) =>
    this.emit({ download });
  private localEntries(): EditorVectorCatalogEntry[] {
    const { local, collection, tab } = this.state;
    const ownedIds = new Set(local.members.map((member) => member.definitionId));
    const memberIds = collection.startsWith('local:')
      ? new Set(
          local.members
            .filter((member) => member.collectionId === collection.slice(6))
            .map((member) => member.definitionId)
        )
      : null;
    const query = this.state.query.trim().toLocaleLowerCase();
    return local.items
      .filter(
        (item) =>
          (tab !== 'favorites' || item.favorite) &&
          (tab !== 'mine' || item.imported || ownedIds.has(item.definitionId)) &&
          (!memberIds || memberIds.has(item.definitionId))
      )
      .map((item) => ({
        key: item.definitionId,
        name: item.name ?? item.definitionId.slice(0, 12),
        prefix: item.prefix,
        definition: this.definitions.get(item.definitionId) ?? null,
        favorite: item.favorite,
        local: true,
        imported: item.imported,
        issue: false,
      }))
      .filter(
        (entry) =>
          (!collection.startsWith('remote:') || entry.prefix === collection.slice(7)) &&
          (!query || `${entry.name} ${entry.prefix ?? ''}`.toLocaleLowerCase().includes(query))
      );
  }
  private async warmLocal(entries: EditorVectorCatalogEntry[], generation: number) {
    for (const entry of entries.slice(0, 128)) {
      if (this.disposed || generation !== this.revision) return;
      try {
        if (!entry.definition)
          this.definitions.set(
            entry.key,
            await this.dependencies.library.readDefinition(entry.key)
          );
      } catch {
        if (generation === this.revision) this.refusedPreview(entry.key);
        continue;
      }
      if (generation === this.revision)
        this.emit({
          entries: this.state.entries.map((current) =>
            current.key === entry.key
              ? { ...current, definition: this.definitions.get(entry.key) ?? null }
              : current
          ),
        });
    }
  }
  refreshCacheUsage = async () => {
    if (this.disposed) return;
    const generation = ++this.cacheUsageRevision;
    let cacheUsage: EditorVectorCacheUsage | null;
    try {
      cacheUsage = await this.dependencies.cache.stats();
    } catch {
      cacheUsage = null;
    }
    if (generation === this.cacheUsageRevision) this.emit({ cacheUsage });
  };
  refresh = async () => {
    try {
      const { library, downloads } = this.dependencies;
      const [local, settings] = await Promise.all([library.readCatalog(), library.readSettings()]);
      if (this.disposed) return;
      const retained = await Promise.all(
        local.collections.map((collection) => downloads.inspect(collection.id))
      );
      if (this.disposed) return;
      this.emit({
        local,
        settings,
        error: false,
        downloads: retained.filter(
          (entry): entry is EditorVectorDownload => entry !== null && entry !== undefined
        ),
      });
      await this.searchNow();
    } catch (error) {
      this.failure(error, { status: 'error' });
    }
  };
  private acceptPreview(key: string, definition: EditorVectorDefinition) {
    const item = this.state.local.items.find((row) => row.definitionId === definition.id);
    this.emit({
      entries: this.state.entries.map((row) =>
        row.key === key ? { ...row, definition, favorite: item?.favorite ?? false } : row
      ),
    });
  }
  private refusedPreview(key: string) {
    this.emit({
      entries: this.state.entries.map((row) => (row.key === key ? { ...row, issue: true } : row)),
    });
  }
  loadCollections = async () => {
    if (!this.state.settings?.networkEnabled) return;
    try {
      const remoteCollections = await this.preparation.collections();
      if (remoteCollections) this.emit({ remoteCollections });
    } catch (error) {
      this.failure(error);
    }
  };
  private pageRequest(explicit: boolean, append: boolean) {
    const { tab, collection, settings, remoteStart } = this.state;
    const query = this.state.query.trim();
    if (
      tab !== 'catalog' ||
      collection.startsWith('local:') ||
      !settings?.networkEnabled ||
      !settings.disclosureAccepted ||
      (!query && !collection.startsWith('remote:')) ||
      (!explicit && query.length > 0 && query.length < 2)
    )
      return null;
    return {
      query,
      prefix: collection.startsWith('remote:') ? collection.slice(7) : undefined,
      start: append ? remoteStart : 0,
    };
  }
  private publishPage(
    icons: string[],
    source: EditorVectorSourceToken,
    start: number,
    append: boolean
  ) {
    const incoming: EditorVectorCatalogEntry[] = icons.map((id) => ({
      key: id,
      name: id.split(':')[1]!,
      prefix: id.split(':')[0]!,
      definition: this.preparation.definition(source, id),
      favorite: false,
      local: false,
      imported: false,
      issue: false,
    }));
    const entries = append
      ? [
          ...this.state.entries,
          ...incoming.filter((entry) => !this.state.entries.some((row) => row.key === entry.key)),
        ]
      : incoming;
    this.emit({
      entries,
      status: 'ready',
      hasMore: icons.length === 64,
      remoteStart: start + icons.length,
      ...(append ? { visibleCount: Math.max(this.state.visibleCount + 64, entries.length) } : {}),
    });
    return entries;
  }
  searchNow = async (explicit = false, append = false) => {
    this.cancelSearch();
    const generation = this.revision;
    const controller = new AbortController();
    this.request = controller;
    const local = this.localEntries();
    if (!append) {
      this.emit({ entries: local, status: 'ready', error: false, hasMore: false, remoteStart: 0 });
      void this.warmLocal(local, generation);
    }
    const page = this.pageRequest(explicit, append);
    if (!page) return;
    this.emit({ status: 'loading' });
    const isCurrent = () => !this.disposed && generation === this.revision;
    try {
      const result = await this.preparation.searchPage(
        page.query,
        page.prefix,
        page.start,
        controller.signal
      );
      if (!isCurrent() || !this.currentSource(result.source)) return;
      const entries = this.publishPage(result.icons, result.source, page.start, append);
      await this.preparation.previews(result.source, entries, {
        signal: controller.signal,
        isCurrent,
        prepared: (key, definition) => this.acceptPreview(key, definition),
        refused: (key) => this.refusedPreview(key),
        failed: (prefix, error) =>
          this.failure(error, {
            entries: this.state.entries.map((row) =>
              row.prefix === prefix ? { ...row, issue: true } : row
            ),
          }),
      });
    } catch (error) {
      if (isCurrent() && !controller.signal.aborted) this.failure(error, { status: 'error' });
    }
  };
  setQuery = (query: string) => {
    this.cancelSearch();
    this.emit({ query, selectedKey: null, scrollTop: 0, visibleCount: 128 });
    this.searchTimer = setTimeout(() => void this.searchNow(), 350);
  };
  setFilter = (tab: EditorVectorLibraryTab, collection = this.state.collection) => {
    this.emit({ tab, collection, selectedKey: null, scrollTop: 0, visibleCount: 128 });
    void this.searchNow();
  };
  perform = async (action: () => Promise<unknown>) => {
    this.emit({ busy: true, error: false });
    try {
      await action();
      await this.refresh();
      return true;
    } catch (error) {
      this.failure(error);
      return false;
    } finally {
      this.emit({ busy: false });
    }
  };
  importFiles = async (files: readonly File[], collectionId?: string) =>
    this.perform(async () => {
      const completed = await importEditorVectorFiles(files, collectionId, {
        library: this.dependencies.library,
        isAlive: this.isAlive,
        accepted: (definition) => {
          this.definitions.set(definition.id, definition);
        },
        progress: (imports) => this.emit({ imports }),
      });
      if (completed) this.emit({ tab: 'mine' });
    });
  favorite = async (entry: EditorVectorCatalogEntry) => {
    const definition = entry.definition;
    if (!definition) return false;
    const { library } = this.dependencies;
    return this.perform(async () => {
      if (entry.favorite) await library.setFavorite(definition.id, false);
      else if (!entry.local) {
        const admission = await library.captureAdmission(definition.id);
        await library.publish(definition, {
          kind: 'favorite',
          expectedItem: admission.expectedItem,
          ...(this.state.settings
            ? {
                source: {
                  sourceId: this.state.settings.baseUrl,
                  incarnation: this.state.settings.incarnation,
                  generation: this.state.settings.sourceGeneration,
                },
              }
            : {}),
        });
      } else await library.setFavorite(definition.id, !entry.favorite);
    });
  };
  used = async (definition: EditorVectorDefinition) => {
    this.definitions.set(definition.id, definition);
    await this.refresh();
  };
  enableSource = async (baseUrl: string, disclosureAccepted: boolean) => {
    if (!disclosureAccepted || !this.state.settings) return false;
    const accepted = this.state.settings;
    this.emit({ busy: true, error: false });
    try {
      const authorized = await authorizeEditorVectorSource({
        baseUrl,
        disclosureAccepted,
        accepted,
        requestPermission: this.dependencies.requestPermission,
        readSettings: this.dependencies.library.readSettings,
        isAlive: this.isAlive,
      });
      if (!authorized) return false;
      return await this.saveSettings(
        { baseUrl, networkEnabled: true, disclosureAccepted: true },
        authorized
      );
    } catch (error) {
      this.failure(error);
      return false;
    } finally {
      this.emit({ busy: false });
    }
  };
  saveSettings = async (
    patch: Parameters<EditorVectorLibrary['updateSettings']>[0],
    expected = this.state.settings
  ) => {
    this.cancelSearch();
    this.download.abort();
    return this.perform(async () => {
      const settings = expected ?? (await this.dependencies.library.readSettings());
      await this.dependencies.library.updateSettings(patch, {
        revision: settings.revision,
        incarnation: settings.incarnation,
      });
      this.emit({
        remoteCollections: [],
        entries: [],
        connected: false,
        retryAt: null,
        errorCode: null,
      });
    });
  };
  checkConnection = async () =>
    this.perform(async () => {
      this.admitNetwork();
      await this.dependencies.catalog.check();
      this.emit({ connected: true });
      await this.loadCollections();
    });
  select = (selectedKey: string | null) => {
    this.emit({ selectedKey });
    const entry = this.state.entries.find((row) => row.key === selectedKey);
    if (entry?.local && !entry.definition) void this.warmLocal([entry], this.revision);
  };
  setScroll = (scrollTop: number) => {
    if (scrollTop !== this.state.scrollTop) this.emit({ scrollTop });
  };
  showMore = () => {
    const next = this.state.visibleCount + 128;
    void this.warmLocal(this.state.entries.slice(this.state.visibleCount, next), this.revision);
    this.emit({ visibleCount: next });
  };
  dispose = () => {
    this.disposed = true;
    this.cancelSearch();
    this.download.abort();
    this.listeners.clear();
  };
}

/** Composes explicit operation owners for one mounted editor without exposing its mutable state. */
export function createEditorVectorLibrarySession(dependencies: SessionDependencies) {
  const { library, cache, catalog, downloads } = dependencies;
  const session = new MountedVectorLibrarySession(dependencies);
  const preparation = new EditorVectorCatalogPreparation({
    cache,
    catalog,
    definitions: session.definitions,
    source: session.sourceToken,
    currentSource: session.currentSource,
    isAlive: session.isAlive,
    admitNetwork: session.admitNetwork,
  });
  const download = new EditorVectorDownloadJob({
    library,
    downloads,
    preparation,
    isAlive: session.isAlive,
    currentSource: session.currentSource,
    collectionName: session.collectionName,
    progress: session.downloadProgress,
    failed: (error) => session.failure(error),
    refresh: session.refresh,
  });
  session.connect(preparation, download);
  return {
    getSnapshot: session.getSnapshot,
    subscribe: session.subscribe,
    refresh: session.refresh,
    refreshCacheUsage: session.refreshCacheUsage,
    setQuery: session.setQuery,
    setFilter: session.setFilter,
    searchNow: session.searchNow,
    loadMore: () => session.searchNow(true, true),
    loadCollections: session.loadCollections,
    importFiles: session.importFiles,
    favorite: session.favorite,
    used: session.used,
    select: session.select,
    setScroll: session.setScroll,
    showMore: session.showMore,
    saveSettings: session.saveSettings,
    enableSource: session.enableSource,
    checkConnection: session.checkConnection,
    downloadCollection: (prefix: string) => download.start(prefix),
    cancelDownload: () => download.cancel(),
    clearCache: () =>
      session.perform(async () => {
        await cache.clear();
        await session.refreshCacheUsage();
      }),
    createCollection: (name: string) =>
      session.perform(() => library.createCollection({ id: crypto.randomUUID(), name })),
    renameCollection: (id: string, incarnation: string, name: string) =>
      session.perform(() => library.renameCollection(id, incarnation, name)),
    removeCollection: (id: string, incarnation: string) =>
      session.perform(() => library.removeCollection(id, incarnation)),
    removeItem: (id: string) => session.perform(() => library.removeItem(id)),
    savePreset: (input: Pick<EditorVectorPreset, 'id' | 'name' | 'style'>) =>
      session.perform(() => library.savePreset(input, null)),
    removePreset: (id: string, incarnation: string) =>
      session.perform(() => library.removePreset(id, incarnation)),
    dispose: session.dispose,
  };
}
export type EditorVectorLibrarySession = ReturnType<typeof createEditorVectorLibrarySession>;
