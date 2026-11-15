import type { EditorVectorLibrary } from '../../../composition/persistence/vector-elements/library';
import type { createEditorVectorDownloads } from '../../../composition/persistence/vector-elements/downloads';
import type {
  EditorVectorDownload,
  EditorVectorDownloadToken,
} from '../../../composition/persistence/vector-elements/contracts';
import { catalogName, type EditorVectorSourceToken } from '../../../features/editor/vector-catalog';
import { prepareEditorIconifyDefinition } from '../../objects/vector-elements/iconify';
import type { EditorVectorCatalogPreparation } from './catalog-preparation';

interface DownloadProgress {
  prefix: string;
  accepted: number;
  total: number;
  status: 'downloading' | 'partial' | 'ready' | 'error';
}
interface DownloadDependencies {
  library: Pick<EditorVectorLibrary, 'readCatalog' | 'createCollection'>;
  downloads: ReturnType<typeof createEditorVectorDownloads>;
  preparation: Pick<
    EditorVectorCatalogPreparation,
    'collection' | 'refreshCollection' | 'prepareRemote'
  >;
  isAlive(): boolean;
  currentSource(source: EditorVectorSourceToken): boolean;
  collectionName(prefix: string): string;
  progress(value: DownloadProgress): void;
  failed(error: unknown): void;
  refresh(): Promise<void>;
}
interface Attempt {
  controller: AbortController;
  token: EditorVectorDownloadToken | null;
  progress: DownloadProgress | null;
}
async function collectionId(sourceId: string, prefix: string) {
  const bytes = new TextEncoder().encode(JSON.stringify([sourceId, prefix]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `download-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** One explicit download lifetime owns its abort signal and captured durable attempt token. */
export class EditorVectorDownloadJob {
  private attempt: Attempt | null = null;
  constructor(private readonly dependencies: DownloadDependencies) {}
  private current(attempt: Attempt) {
    return (
      this.attempt === attempt && this.dependencies.isAlive() && !attempt.controller.signal.aborted
    );
  }
  private progress(
    attempt: Attempt,
    prefix: string,
    names: string[],
    row: EditorVectorDownload | null
  ) {
    if (!this.current(attempt)) return;
    attempt.progress = {
      prefix,
      accepted: names.filter((name) => Object.hasOwn(row?.accepted ?? {}, name)).length,
      total: names.length,
      status: row?.status === 'ready' ? 'ready' : 'downloading',
    };
    this.dependencies.progress(attempt.progress);
  }
  private async open(prefix: string, attempt: Attempt) {
    const { library, downloads, preparation, currentSource } = this.dependencies;
    if (!catalogName(prefix)) throw new Error('Invalid vector download prefix.');
    const remote = await preparation.collection(prefix, attempt.controller.signal);
    if (!this.current(attempt) || !currentSource(remote.source)) return null;
    const names = remote.names;
    if (!names.length) throw new Error('Empty vector collection.');
    const id = await collectionId(remote.source.sourceId, prefix);
    if (!this.current(attempt)) return null;
    const local = await library.readCatalog();
    if (!this.current(attempt)) return null;
    let collection = local.collections.find((row) => row.id === id);
    if (!collection)
      collection = await library.createCollection({
        id,
        name: this.dependencies.collectionName(prefix),
      });
    if (!this.current(attempt)) return null;
    const token = await downloads.begin({
      collection: { id: collection.id, incarnation: collection.incarnation },
      source: remote.source,
      manifest: names,
      prefix,
    });
    attempt.token = token;
    if (!this.current(attempt)) return null;
    const row = await downloads.inspect(id);
    if (!this.current(attempt)) return null;
    this.progress(attempt, prefix, names, row);
    return {
      token,
      names,
      pending: names.filter((name) => !Object.hasOwn(row?.accepted ?? {}, name)),
    };
  }
  private async publishBatch(
    prefix: string,
    names: string[],
    attempt: Attempt,
    token: EditorVectorDownloadToken
  ) {
    const prepared = await this.dependencies.preparation.prepareRemote(
      prefix,
      names,
      attempt.controller.signal
    );
    if (!this.current(attempt)) return null;
    const entries = [];
    for (const name of names) {
      try {
        const definition = await prepareEditorIconifyDefinition(
          prepared.set,
          name,
          prepared.source.sourceId
        );
        if (!this.current(attempt)) return null;
        entries.push({ name, definition });
      } catch {
        await this.dependencies.downloads.fail(token, 'definition-refused');
      }
    }
    if (!this.current(attempt)) return null;
    return (await this.dependencies.downloads.acceptBatch(token, entries)).state;
  }
  /** Compare names only. Existing artwork bodies and user-owned local assets are not replaced. */
  async check(prefix: string) {
    if (!catalogName(prefix)) throw new Error('Invalid vector download prefix.');
    const remote = await this.dependencies.preparation.refreshCollection(
      prefix,
      new AbortController().signal
    );
    const id = await collectionId(remote.source.sourceId, prefix);
    const row = await this.dependencies.downloads.inspect(id);
    if (!this.dependencies.isAlive() || !this.dependencies.currentSource(remote.source))
      throw new Error('Superseded vector source.');
    const names = new Set(remote.names);
    return {
      added: remote.names.filter((name) => !Object.hasOwn(row?.accepted ?? {}, name)).length,
      removed: Object.keys(row?.accepted ?? {}).filter((name) => !names.has(name)).length,
    };
  }
  async start(prefix: string) {
    this.abort();
    const attempt: Attempt = { controller: new AbortController(), token: null, progress: null };
    this.attempt = attempt;
    try {
      const opened = await this.open(prefix, attempt);
      if (!opened) return;
      for (let offset = 0; offset < opened.pending.length; offset += 32) {
        if (!this.current(attempt)) return;
        const row = await this.publishBatch(
          prefix,
          opened.pending.slice(offset, offset + 32),
          attempt,
          opened.token
        );
        if (!this.current(attempt)) return;
        this.progress(attempt, prefix, opened.names, row);
      }
      if (this.current(attempt)) {
        if (attempt.progress?.status === 'downloading') {
          attempt.progress = { ...attempt.progress, status: 'partial' };
          this.dependencies.progress(attempt.progress);
        }
        await this.dependencies.refresh();
      }
    } catch (error) {
      if (!this.current(attempt)) return;
      if (attempt.progress)
        this.dependencies.progress({
          ...attempt.progress,
          status: attempt.progress.accepted ? 'partial' : 'error',
        });
      this.dependencies.failed(error);
    }
  }
  abort() {
    this.attempt?.controller.abort();
  }
  async cancel() {
    const attempt = this.attempt;
    if (!attempt) return;
    attempt.controller.abort();
    if (attempt.token)
      await this.dependencies.downloads.cancel(attempt.token).catch(() => undefined);
    if (this.attempt === attempt && this.dependencies.isAlive() && attempt.progress)
      this.dependencies.progress({
        ...attempt.progress,
        status: attempt.progress.accepted ? 'partial' : 'error',
      });
  }
}
