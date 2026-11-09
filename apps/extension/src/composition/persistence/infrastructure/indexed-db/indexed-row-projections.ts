import { projectRowReferenceKeys } from '../../assets/retention-index-projection';
import {
  createWorkspaceIndexMutation,
  type WorkspaceIndexTransaction,
  WORKSPACE_HEAD_STORE,
  WORKSPACE_HISTORY_STORE,
} from '../../review-workspaces/index-projection';
import {
  REFERENCE_INDEX_STORES,
  stripRowReferenceMetadata,
  withRowReferenceMetadata,
} from './row-index-contract';

interface Transaction extends WorkspaceIndexTransaction {
  readonly done: Promise<void>;
  abort(): void;
}

interface ProjectionDatabase {
  transaction(
    names: string[],
    mode: IDBTransactionMode,
    options?: IDBTransactionOptions
  ): Transaction;
}
const indexedStores: ReadonlySet<string> = new Set(REFERENCE_INDEX_STORES);
const workspaceStores: ReadonlySet<string> = new Set([
  WORKSPACE_HEAD_STORE,
  WORKSPACE_HISTORY_STORE,
]);

function cleanMany(value: unknown): unknown {
  return Array.isArray(value) ? value.map(stripRowReferenceMetadata) : value;
}

function boundMember(target: object, key: PropertyKey): unknown {
  const value: unknown = Reflect.get(target, key, target);
  return typeof value === 'function' ? value.bind(target) : value;
}

function wrapCursor<T extends object>(raw: T, source: object, indexed: boolean): T {
  return new Proxy(raw, {
    get(target, key) {
      if (key === 'source') return source;
      if (key === 'value' && indexed)
        return stripRowReferenceMetadata(Reflect.get(target, key, target));
      if (indexed && (key === 'update' || key === 'delete'))
        return () => {
          throw new Error(
            'Indexed source cursor mutation requires the canonical object store writer.'
          );
        };
      const method: unknown = Reflect.get(target, key, target);
      if (
        typeof method === 'function' &&
        ['continue', 'advance', 'continuePrimaryKey'].includes(String(key))
      ) {
        return async (...args: unknown[]) => {
          const next: unknown = await Reflect.apply(method, target, args);
          return next !== null && typeof next === 'object'
            ? wrapCursor(next, source, indexed)
            : next;
        };
      }
      return boundMember(target, key);
    },
  });
}

type PendingReader = <T>(run: () => Promise<T>) => Promise<T>;
interface ReaderContext {
  indexed: boolean;
  afterPending: PendingReader;
  transaction(): Transaction;
  store(): ReturnType<Transaction['objectStore']>;
  cursorSource(adapted: object): object;
}

function wrapIterator(
  iterator: object,
  source: object,
  indexed: boolean,
  afterPending: PendingReader
): object {
  return new Proxy(iterator, {
    get(iteratorTarget, iteratorKey) {
      if (iteratorKey === Symbol.asyncIterator)
        return function (this: object) {
          return this;
        };
      const next: unknown = Reflect.get(iteratorTarget, iteratorKey, iteratorTarget);
      if (iteratorKey === 'next' && typeof next === 'function')
        return (...nextArgs: unknown[]) =>
          afterPending(async () => {
            const step: unknown = await Reflect.apply(next, iteratorTarget, nextArgs);
            if (
              step !== null &&
              typeof step === 'object' &&
              'value' in step &&
              step.value !== null &&
              typeof step.value === 'object'
            )
              return {
                ...step,
                value: wrapCursor(step.value, source, indexed),
              };
            return step;
          });
      return boundMember(iteratorTarget, iteratorKey);
    },
  });
}

function wrapRead<T extends object>(reader: T, context: ReaderContext): T {
  const adapted = new Proxy(reader, {
    get(target, key) {
      if (key === 'transaction') return context.transaction();
      if (key === 'objectStore') return context.store();
      const method: unknown = Reflect.get(target, key, target);
      if ((key === 'get' || key === 'getAll') && typeof method === 'function')
        return (...args: unknown[]) =>
          context.afterPending(async () => {
            const value: unknown = await Reflect.apply(method, target, args);
            return !context.indexed
              ? value
              : key === 'getAll'
                ? cleanMany(value)
                : stripRowReferenceMetadata(value);
          });
      if ((key === 'openCursor' || key === 'openKeyCursor') && typeof method === 'function')
        return (...args: unknown[]) =>
          context.afterPending(async () => {
            const cursor: unknown = await Reflect.apply(method, target, args);
            return cursor !== null && typeof cursor === 'object'
              ? wrapCursor(cursor, context.cursorSource(adapted), context.indexed)
              : cursor;
          });
      if (['getAllKeys', 'getKey', 'count'].includes(String(key)) && typeof method === 'function')
        return (...args: unknown[]) =>
          context.afterPending(async () => {
            const value: unknown = await Reflect.apply(method, target, args);
            return value;
          });
      if ((key === 'iterate' || key === Symbol.asyncIterator) && typeof method === 'function')
        return (...args: unknown[]) => {
          const iterator: unknown = Reflect.apply(method, target, args);
          if (iterator === null || typeof iterator !== 'object')
            throw new Error('Invalid native iterator.');
          return wrapIterator(
            iterator,
            context.cursorSource(adapted),
            context.indexed,
            context.afterPending
          );
        };
      if (key === 'index' && typeof method === 'function')
        return (...args: unknown[]) => {
          const index: unknown = Reflect.apply(method, target, args);
          if (index === null || typeof index !== 'object')
            throw new Error('Invalid native index handle.');
          return wrapRead(index, { ...context, cursorSource: (adapted) => adapted });
        };
      return boundMember(target, key);
    },
  });
  return adapted;
}

function transactionQueue(raw: Transaction) {
  let pending: Promise<unknown> | undefined;
  const afterPending = <T>(run: () => Promise<T>): Promise<T> =>
    pending ? pending.then(run) : run();
  const serialized = <T>(run: () => Promise<T>): Promise<T> => {
    const next = afterPending(run);
    pending = next;
    // A failed derived write cannot leave a committable source-only transaction.
    void next.then(
      () => {
        if (pending === next) pending = undefined;
      },
      () => {
        try {
          raw.abort();
        } catch {
          /* Native abort or completion already won. */
        }
      }
    );
    return next;
  };
  return { afterPending, serialized };
}

function wrapTransaction(
  raw: Transaction,
  singleStore: string | undefined,
  database: () => object
): Transaction {
  const stores = new Map<string, ReturnType<Transaction['objectStore']>>();
  const workspace = createWorkspaceIndexMutation(raw);
  const { afterPending, serialized } = transactionQueue(raw);
  function store(name: string): ReturnType<Transaction['objectStore']> {
    const known = stores.get(name);
    if (known) return known;
    const source = raw.objectStore(name);
    const indexed = indexedStores.has(name);
    const readable = wrapRead(source, {
      indexed,
      afterPending,
      transaction: () => transactionResult,
      store: () => store(name),
      cursorSource: (adapted) => stores.get(name) ?? adapted,
    });
    const result = new Proxy(readable, {
      get(target, key) {
        if (key === 'put' || key === 'add')
          return (value: unknown, rowKey?: IDBValidKey) => {
            if (workspaceStores.has(name))
              return serialized(() => workspace.put(name, value, key, rowKey));
            const write = source[key];
            if (!write) throw new Error('Indexed source write requires a writable transaction.');
            return afterPending(() =>
              write.call(
                source,
                indexed
                  ? withRowReferenceMetadata(value, projectRowReferenceKeys(name, value))
                  : value,
                rowKey
              )
            );
          };
        if (workspaceStores.has(name) && key === 'delete')
          return (rowKey: IDBValidKey | IDBKeyRange) =>
            serialized(() => workspace.delete(name, rowKey));
        if (workspaceStores.has(name) && key === 'clear')
          return () => serialized(() => workspace.clear(name));
        if (key === 'delete' || key === 'clear') {
          const method = boundMember(source, key);
          if (typeof method === 'function')
            return (...args: unknown[]) =>
              afterPending(async () => {
                const value: unknown = await Reflect.apply(method, source, args);
                return value;
              });
        }
        return boundMember(target, key);
      },
    });
    stores.set(name, result);
    return result;
  }
  const transactionResult = new Proxy(raw, {
    get(target, key) {
      if (key === 'db') return database();
      if (key === 'objectStore') return store;
      if (key === 'store') return singleStore ? store(singleStore) : undefined;
      return boundMember(target, key);
    },
  });
  return transactionResult;
}

async function writeShortcut(
  db: ProjectionDatabase,
  database: () => object,
  key: PropertyKey,
  name: string,
  value?: unknown,
  rowKey?: IDBValidKey
): Promise<unknown> {
  // Shortcuts must enter the same decorated transaction path as explicit writes.
  const selected = workspaceStores.has(name)
    ? [WORKSPACE_HEAD_STORE, WORKSPACE_HISTORY_STORE]
    : [name];
  const native = db.transaction(selected, 'readwrite');
  const current = wrapTransaction(native, name, database);
  const source = current.objectStore(name);
  const call = (method: string, args: unknown[]) => {
    const member = boundMember(source, method);
    if (typeof member !== 'function') throw new Error('Native write method is unavailable.');
    const result: unknown = Reflect.apply(member, source, args);
    return result;
  };
  try {
    let result: unknown;
    if (key === 'put' || key === 'add') result = await call(key, [value, rowKey]);
    else if (key === 'clear') result = await call('clear', []);
    else {
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        !(value instanceof Date) &&
        !(value instanceof ArrayBuffer) &&
        !Array.isArray(value) &&
        !(value instanceof IDBKeyRange)
      )
        throw new Error('Invalid native deletion key.');
      result = await call('delete', [value]);
    }
    await current.done;
    return result;
  } catch (error) {
    try {
      current.abort();
    } catch {
      /* Native transaction may already be closed. */
    }
    await current.done.catch(() => undefined);
    throw error;
  }
}

/** Adapt the private native format without changing source DTOs or transaction ownership. */
export function withIndexedRowProjections<T extends ProjectionDatabase>(db: T): T {
  const admitted = new Proxy(db, {
    get(target, key) {
      if (key === 'transaction')
        return (
          names: string | string[],
          mode: IDBTransactionMode = 'readonly',
          options?: IDBTransactionOptions
        ) => {
          const selected = typeof names === 'string' ? [names] : [...names];
          const originalSingle = selected.length === 1 ? selected[0] : undefined;
          if (mode === 'readwrite' && selected.some((name) => workspaceStores.has(name))) {
            for (const name of workspaceStores) if (!selected.includes(name)) selected.push(name);
          }
          return wrapTransaction(
            target.transaction(selected, mode, options),
            originalSingle,
            () => admitted
          );
        };
      if (key === 'put' || key === 'add' || key === 'delete' || key === 'clear')
        return (name: string, value?: unknown, rowKey?: IDBValidKey) =>
          writeShortcut(db, () => admitted, key, name, value, rowKey);
      if (['get', 'getAll', 'getFromIndex', 'getAllFromIndex'].includes(String(key))) {
        const method: unknown = Reflect.get(target, key, target);
        if (typeof method === 'function')
          return async (name: string, ...args: unknown[]) => {
            const value: unknown = await Reflect.apply(method, target, [name, ...args]);
            if (!indexedStores.has(name)) return value;
            return key === 'getAll' || key === 'getAllFromIndex'
              ? cleanMany(value)
              : stripRowReferenceMetadata(value);
          };
      }
      return boundMember(target, key);
    },
  });
  return admitted;
}
