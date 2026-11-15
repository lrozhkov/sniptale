import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import {
  isCatalogData,
  EditorVectorCatalogError,
  VECTOR_CATALOG_MAX_SEARCH_RESULTS,
  type CatalogOperation,
  type EditorVectorSourceToken,
} from '../../../features/editor/vector-catalog';
import type { createEditorVectorCache } from '../../../composition/persistence/vector-elements/cache';
import {
  parseEditorIconifySet,
  prepareEditorIconifyDefinition,
} from '../../objects/vector-elements/iconify';
import { validateEditorVectorDefinition } from '../../objects/vector-elements/prepare';

interface ArtworkEntry {
  key: string;
  name: string;
  prefix: string | null;
}
interface Metadata {
  source: EditorVectorSourceToken;
  data: unknown;
  fresh?: boolean;
}
interface CatalogPort {
  collections(signal?: AbortSignal): Promise<Metadata>;
  search(
    input: { query: string; prefix?: string; start?: number; limit?: number },
    signal?: AbortSignal
  ): Promise<Metadata>;
  collection(prefix: string, signal?: AbortSignal): Promise<Metadata>;
  assets(prefix: string, names: readonly string[], signal?: AbortSignal): Promise<Metadata>;
}
interface PreparationDependencies {
  cache: ReturnType<typeof createEditorVectorCache>;
  catalog: CatalogPort;
  definitions: Pick<Map<string, EditorVectorDefinition>, 'get' | 'set'>;
  source(): EditorVectorSourceToken;
  currentSource(source: EditorVectorSourceToken): boolean;
  isAlive(): boolean;
  admitNetwork(): void;
}
interface PreviewLifetime {
  signal: AbortSignal;
  isCurrent(): boolean;
  prepared(key: string, definition: EditorVectorDefinition): void;
  refused(key: string): void;
  failed(prefix: string, error: unknown): void;
}
const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
const nameSyntax = (value: string) => value.split('-').every((part) => /^[a-z0-9]+$/u.test(part));

function visibleNames(value: unknown): string[] {
  if (!isRecord(value)) throw new Error('Invalid vector collection response.');
  const categories = isRecord(value['categories'])
    ? Object.values(value['categories']).flatMap(stringArray)
    : [];
  const hidden = new Set(stringArray(value['hidden']));
  return [
    ...new Set([
      ...stringArray(value['uncategorized']),
      ...stringArray(value['icons']),
      ...categories,
    ]),
  ].filter((name) => nameSyntax(name) && !hidden.has(name));
}

/** Owns advisory catalog preparation; the mounted session issues every view lifetime. */
export class EditorVectorCatalogPreparation {
  private readonly metadataRequests = new Map<string, Promise<Metadata>>();
  private readonly freshManifests = new Map<
    string,
    { until: number; request: Promise<Metadata> }
  >();
  private readonly manifestFailures = new Map<string, { until: number; error: unknown }>();
  private attributionSource = '';
  private readonly attribution = new Map<string, unknown>();
  constructor(private readonly dependencies: PreparationDependencies) {}

  private sourceKey(source: EditorVectorSourceToken) {
    return JSON.stringify(source);
  }
  private remember(source: EditorVectorSourceToken, entries: unknown) {
    if (!this.dependencies.currentSource(source) || !isRecord(entries)) return;
    const key = this.sourceKey(source);
    if (key !== this.attributionSource) {
      this.attribution.clear();
      this.attributionSource = key;
    }
    for (const [prefix, info] of Object.entries(entries)) {
      if (this.attribution.size >= 20_000) break;
      if (
        isRecord(info) &&
        isCatalogData('collections', { [prefix]: { ...info, total: info['total'] ?? 0 } })
      )
        this.attribution.set(prefix, info);
    }
  }
  private info(source: EditorVectorSourceToken, prefix: string) {
    return this.sourceKey(source) === this.attributionSource
      ? this.attribution.get(prefix)
      : undefined;
  }

  private cacheKey(
    source: EditorVectorSourceToken,
    kind: 'search' | 'collections' | 'definition',
    id: string
  ) {
    return {
      sourceId: source.sourceId,
      kind,
      id: `profile1:${source.incarnation}:${source.generation}:${id}`,
    };
  }
  private definitionKey(source: EditorVectorSourceToken, id: string) {
    return `${source.sourceId}:${source.incarnation}:${source.generation}:profile1:${id}`;
  }
  definition(source: EditorVectorSourceToken, id: string) {
    return this.dependencies.definitions.get(this.definitionKey(source, id)) ?? null;
  }
  private async readMetadata(
    operation: Extract<CatalogOperation, 'search' | 'collections' | 'collection'>,
    id: string,
    load: () => Promise<Metadata>,
    fresh = false
  ) {
    const { cache, currentSource, isAlive, admitNetwork } = this.dependencies;
    const source = this.dependencies.source();
    const key = this.cacheKey(
      source,
      operation === 'search' ? 'search' : 'collections',
      `${operation}:${id}`
    );
    const cached = fresh ? null : await cache.read(key);
    if (!currentSource(source) || !isAlive()) throw new Error('Superseded vector source.');
    if (isCatalogData(operation, cached)) {
      await cache.touch(key);
      return { source, data: cached, fresh: false };
    }
    admitNetwork();
    const result = await load();
    if (!currentSource(result.source) || !isAlive() || !isCatalogData(operation, result.data))
      throw new Error('Invalid vector catalog response.');
    await cache.put(key, result.data, result.source);
    return { ...result, fresh: true };
  }
  async metadata(
    operation: Extract<CatalogOperation, 'search' | 'collections' | 'collection'>,
    id: string,
    load: () => Promise<Metadata>,
    fresh = false
  ): Promise<Metadata> {
    if (operation === 'search') return this.readMetadata(operation, id, load);
    const key = `${this.sourceKey(this.dependencies.source())}:${operation}:${id}`;
    const failure = this.manifestFailures.get(key);
    if (failure && failure.until > Date.now()) throw failure.error;
    const pending = this.metadataRequests.get(key);
    if (pending) {
      const result = await pending;
      return fresh && !result.fresh ? this.metadata(operation, id, load, true) : result;
    }
    const request = this.readMetadata(operation, id, load, fresh)
      .catch((error: unknown) => {
        if (
          operation === 'collection' &&
          error instanceof EditorVectorCatalogError &&
          ['network-failed', 'timeout', 'http-error', 'rate-limited', 'forbidden'].includes(
            error.code
          )
        ) {
          if (this.manifestFailures.size >= 32)
            this.manifestFailures.delete(this.manifestFailures.keys().next().value!);
          const cooldown =
            error instanceof EditorVectorCatalogError ? (error.retryAfterSeconds ?? 30) : 30;
          this.manifestFailures.set(key, {
            until: Date.now() + Math.max(30, cooldown) * 1000,
            error,
          });
        }
        throw error;
      })
      .finally(() => this.metadataRequests.delete(key));
    this.metadataRequests.set(key, request);
    return request;
  }
  async collections() {
    const result = await this.metadata('collections', 'all', () =>
      this.dependencies.catalog.collections()
    );
    if (!this.dependencies.currentSource(result.source)) return null;
    if (!isRecord(result.data)) throw new Error('Invalid vector collections response.');
    this.remember(result.source, result.data);
    return Object.entries(result.data)
      .filter(([prefix, info]) => nameSyntax(prefix) && isRecord(info))
      .map(([prefix, info]) => ({
        prefix,
        name: isRecord(info) && typeof info['name'] === 'string' ? info['name'] : prefix,
      }));
  }
  /** Explicit manifest checks are coalesced and limited to one request per source/prefix in five minutes. */
  async refreshCollection(prefix: string, signal: AbortSignal) {
    if (signal.aborted) throw new EditorVectorCatalogError('canceled');
    const source = this.dependencies.source();
    const key = `${this.sourceKey(source)}:${prefix}`;
    const previous = this.freshManifests.get(key);
    let request = previous?.until && previous.until > Date.now() ? previous.request : null;
    if (!request) {
      request = this.metadata(
        'collection',
        prefix,
        () => this.dependencies.catalog.collection(prefix),
        true
      );
      if (this.freshManifests.size >= 32)
        this.freshManifests.delete(this.freshManifests.keys().next().value!);
      this.freshManifests.set(key, { until: Date.now() + 5 * 60_000, request });
    }
    const result = await request;
    if (signal.aborted) throw new EditorVectorCatalogError('canceled');
    if (!this.dependencies.currentSource(result.source) || !this.dependencies.isAlive())
      throw new EditorVectorCatalogError('source-changed');
    if (isRecord(result.data)) this.remember(result.source, { [prefix]: result.data['info'] });
    return { ...result, names: visibleNames(result.data) };
  }
  async collection(prefix: string, signal: AbortSignal) {
    if (signal.aborted) throw new EditorVectorCatalogError('canceled');
    const result = await this.metadata('collection', prefix, () =>
      this.dependencies.catalog.collection(prefix)
    );
    if (signal.aborted) throw new EditorVectorCatalogError('canceled');
    if (isRecord(result.data)) this.remember(result.source, { [prefix]: result.data['info'] });
    return { ...result, names: visibleNames(result.data) };
  }
  async searchPage(
    query: string,
    prefix: string | undefined,
    start: number,
    signal: AbortSignal,
    limit = 64
  ) {
    const result =
      !query && prefix
        ? await this.collection(prefix, signal).then((collection) => ({
            source: collection.source,
            data: {
              icons: collection.names.slice(start, start + 64).map((name) => `${prefix}:${name}`),
              collections: isRecord(collection.data) ? { [prefix]: collection.data['info'] } : {},
            },
          }))
        : await this.metadata(
            'search',
            JSON.stringify({ query, prefix: prefix ?? '', start, limit }),
            () =>
              this.dependencies.catalog.search(
                { query, start, limit, ...(prefix ? { prefix } : {}) },
                signal
              )
          );
    if (signal.aborted) throw new EditorVectorCatalogError('canceled');
    if (!isRecord(result.data)) throw new Error('Invalid vector search response.');
    this.attribution.clear();
    this.remember(result.source, result.data['collections']);
    const icons = [...new Set(stringArray(result.data['icons']))]
      .filter((id) => {
        const parts = id.split(':');
        return parts.length === 2 && parts.every(nameSyntax);
      })
      .slice(0, Math.min(limit, VECTOR_CATALOG_MAX_SEARCH_RESULTS));
    return { source: result.source, icons };
  }
  async prepareRemote(prefix: string, names: string[], signal: AbortSignal) {
    const { catalog, admitNetwork, currentSource } = this.dependencies;
    admitNetwork();
    const result = await catalog.assets(prefix, names, signal);
    if (signal.aborted) throw new EditorVectorCatalogError('canceled');
    if (!currentSource(result.source)) throw new Error('Superseded vector source.');
    let info = this.info(result.source, prefix);
    if (!info && isRecord(result.data) && isRecord(result.data['info'])) info = result.data['info'];
    if (!info) {
      await this.collections();
      info = this.info(result.source, prefix);
    }
    if (!info && result.source.sourceId !== 'https://api.iconify.design/') {
      const metadata = await this.collection(prefix, signal);
      if (isRecord(metadata.data)) info = metadata.data['info'];
    }
    if (!currentSource(result.source)) throw new Error('Superseded vector source.');
    const data = isRecord(result.data) && isRecord(info) ? { ...result.data, info } : result.data;
    return { set: parseEditorIconifySet(data), source: result.source };
  }
  private async cachedDefinition(source: EditorVectorSourceToken, entry: ArtworkEntry) {
    const hot = this.definition(source, entry.key);
    if (hot) return hot;
    const key = this.cacheKey(source, 'definition', entry.key);
    const cached = await this.dependencies.cache.read(key);
    if (cached === null) return null;
    try {
      const definition = await validateEditorVectorDefinition(cached);
      if (
        !this.dependencies.currentSource(source) ||
        definition.provenance.sourceId !== source.sourceId ||
        definition.provenance.prefix !== entry.prefix ||
        definition.provenance.name !== entry.name
      )
        return null;
      this.dependencies.definitions.set(this.definitionKey(source, entry.key), definition);
      await this.dependencies.cache.touch(key);
      return definition;
    } catch {
      return null;
    }
  }
  private async prepareMissing(prefix: string, entries: ArtworkEntry[], lifetime: PreviewLifetime) {
    try {
      const prepared = await this.prepareRemote(
        prefix,
        entries.map((entry) => entry.name),
        lifetime.signal
      );
      for (const entry of entries) {
        try {
          const definition = await prepareEditorIconifyDefinition(
            prepared.set,
            entry.name,
            prepared.source.sourceId
          );
          if (!lifetime.isCurrent()) return;
          this.dependencies.definitions.set(
            this.definitionKey(prepared.source, entry.key),
            definition
          );
          await this.dependencies.cache.put(
            this.cacheKey(prepared.source, 'definition', entry.key),
            definition,
            prepared.source
          );
          if (lifetime.isCurrent()) lifetime.prepared(entry.key, definition);
        } catch {
          if (lifetime.isCurrent()) lifetime.refused(entry.key);
        }
      }
    } catch (error) {
      if (lifetime.isCurrent() && !lifetime.signal.aborted) lifetime.failed(prefix, error);
    }
  }
  private async preparePrefix(
    source: EditorVectorSourceToken,
    prefix: string,
    entries: ArtworkEntry[],
    lifetime: PreviewLifetime
  ) {
    for (let offset = 0; offset < entries.length; offset += 32) {
      if (!lifetime.isCurrent()) return;
      const missing: ArtworkEntry[] = [];
      for (const entry of entries.slice(offset, offset + 32)) {
        const existing = await this.cachedDefinition(source, entry);
        if (!lifetime.isCurrent()) return;
        if (existing) lifetime.prepared(entry.key, existing);
        else missing.push(entry);
      }
      if (missing.length) await this.prepareMissing(prefix, missing, lifetime);
    }
  }
  async previews(
    source: EditorVectorSourceToken,
    entries: ArtworkEntry[],
    lifetime: PreviewLifetime
  ) {
    const prefixes = [...new Set(entries.map((entry) => entry.prefix!))];
    let next = 0;
    const worker = async () => {
      while (next < prefixes.length) {
        const prefix = prefixes[next++]!;
        await this.preparePrefix(
          source,
          prefix,
          entries.filter((entry) => entry.prefix === prefix),
          lifetime
        );
      }
    };
    await Promise.all([worker(), worker()]);
  }
}
