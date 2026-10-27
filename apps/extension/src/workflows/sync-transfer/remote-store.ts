/** One immediate object in a remote namespace. The caller verifies downloaded bytes. */
interface SyncRemoteObject {
  key: string;
  size: number;
}

/** Complete page of immediate objects and child prefixes. */
export interface SyncRemotePage {
  objects: SyncRemoteObject[];
  prefixes: string[];
  nextCursor: string | null;
}

/** Provider-neutral object IO. Keys are relative; writes do not imply integrity or settlement. */
export interface SyncRemoteStore {
  list(prefix: string, options: { signal: AbortSignal; cursor?: string }): Promise<SyncRemotePage>;
  read(key: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  /** The browser can replay a PUT. Keep the attempt key and its frozen bytes identical. */
  write(key: string, body: Blob, signal: AbortSignal): Promise<void>;
}

type SyncRemoteErrorCode =
  | 'invalid-configuration'
  | 'invalid-key'
  | 'invalid-response'
  | 'unsupported-cursor'
  | 'metadata-limit'
  | 'cancelled'
  | 'authentication'
  | 'access-denied'
  | 'missing'
  | 'collision'
  | 'storage-full'
  | 'temporary'
  | 'transport';

/** Fixed diagnostic surface. It never retains a provider message, URL, body, or cause. */
export class SyncRemoteError extends Error {
  constructor(
    readonly code: SyncRemoteErrorCode,
    readonly status: number | null = null
  ) {
    super(code);
    this.name = 'SyncRemoteError';
  }
}
