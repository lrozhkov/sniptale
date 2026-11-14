import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import {
  isCatalogData,
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
  constructor(private readonly dependencies: PreparationDependencies) {}

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
  async metadata(
    operation: Extract<CatalogOperation, 'search' | 'collections' | 'collection'>,
    id: string,
    load: () => Promise<Metadata>
  ) {
    const { cache, currentSource, isAlive, admitNetwork } = this.dependencies;
    const source = this.dependencies.source();
    const key = this.cacheKey(
      source,
      operation === 'search' ? 'search' : 'collections',
      `${operation}:${id}`
    );
    const cached = await cache.read(key);
    if (!currentSource(source) || !isAlive()) throw new Error('Superseded vector source.');
    if (isCatalogData(operation, cached)) {
      await cache.touch(key);
      return { source, data: cached };
    }
    admitNetwork();
    const result = await load();
    if (!currentSource(result.source) || !isAlive() || !isCatalogData(operation, result.data))
      throw new Error('Invalid vector catalog response.');
    await cache.put(key, result.data, result.source);
    return result;
  }
  async collections() {
    const result = await this.metadata('collections', 'all', () =>
      this.dependencies.catalog.collections()
    );
    if (!this.dependencies.currentSource(result.source)) return null;
    if (!isRecord(result.data)) throw new Error('Invalid vector collections response.');
    return Object.entries(result.data)
      .filter(([prefix, info]) => nameSyntax(prefix) && isRecord(info))
      .map(([prefix, info]) => ({
        prefix,
        name: isRecord(info) && typeof info['name'] === 'string' ? info['name'] : prefix,
      }));
  }
  async collection(prefix: string, signal: AbortSignal) {
    const result = await this.metadata('collection', prefix, () =>
      this.dependencies.catalog.collection(prefix, signal)
    );
    return { ...result, names: visibleNames(result.data) };
  }
  async searchPage(query: string, prefix: string | undefined, start: number, signal: AbortSignal) {
    const result =
      !query && prefix
        ? await this.collection(prefix, signal).then((collection) => ({
            source: collection.source,
            data: {
              icons: collection.names.slice(start, start + 64).map((name) => `${prefix}:${name}`),
            },
          }))
        : await this.metadata(
            'search',
            JSON.stringify({ query, prefix: prefix ?? '', start, limit: 64 }),
            () =>
              this.dependencies.catalog.search(
                { query, start, limit: 64, ...(prefix ? { prefix } : {}) },
                signal
              )
          );
    if (!isRecord(result.data)) throw new Error('Invalid vector search response.');
    const icons = [...new Set(stringArray(result.data['icons']))]
      .filter((id) => {
        const parts = id.split(':');
        return parts.length === 2 && parts.every(nameSyntax);
      })
      .slice(0, 64);
    return { source: result.source, icons };
  }
  async prepareRemote(prefix: string, names: string[], signal: AbortSignal) {
    const { catalog, admitNetwork, currentSource } = this.dependencies;
    admitNetwork();
    const result = await catalog.assets(prefix, names, signal);
    if (!currentSource(result.source)) throw new Error('Superseded vector source.');
    const metadata = await this.metadata('collection', prefix, () =>
      catalog.collection(prefix, signal)
    );
    if (!currentSource(metadata.source)) throw new Error('Superseded vector source.');
    const data =
      isRecord(result.data) && isRecord(metadata.data) && isRecord(metadata.data['info'])
        ? { ...result.data, info: metadata.data['info'] }
        : result.data;
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
