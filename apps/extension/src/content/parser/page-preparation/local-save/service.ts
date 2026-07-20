import { buildPreparedSnapshotDocument } from '../snapshot';
import { createLocalHtmlSavePickerOptions, isWritableLocalHtmlPage } from './eligibility';
import {
  PagePreparationLocalSaveResultKind,
  type LocalHtmlFileSystemAccess,
  type SavePreparedLocalHtmlOptions,
  type SavePreparedLocalHtmlResult,
  type WritableLocalHtmlFile,
  type WritableLocalHtmlFileHandle,
} from './types';

function getCurrentFileSystemAccess(): LocalHtmlFileSystemAccess {
  return window as LocalHtmlFileSystemAccess;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

async function ensureWritablePermission(handle: WritableLocalHtmlFileHandle): Promise<boolean> {
  const descriptor = { mode: 'readwrite' as const };
  const queried = await handle.queryPermission?.(descriptor);
  if (queried === 'granted') {
    return true;
  }

  const requested = await handle.requestPermission?.(descriptor);
  if (requested === undefined) {
    return queried === undefined;
  }

  return requested === 'granted';
}

async function selectWritableHandle(
  access: LocalHtmlFileSystemAccess,
  options: SavePreparedLocalHtmlOptions
): Promise<WritableLocalHtmlFileHandle | null> {
  const picker = access.showSaveFilePicker;
  if (!picker) {
    return null;
  }

  return picker(createLocalHtmlSavePickerOptions(options.location));
}

async function abortWritable(writable: WritableLocalHtmlFile | null): Promise<void> {
  if (!writable?.abort) {
    return;
  }

  try {
    await writable.abort();
  } catch {
    // Best-effort rollback for browsers that support aborting a failed write stream.
  }
}

async function writeHtmlToHandle(handle: WritableLocalHtmlFileHandle, html: string): Promise<void> {
  let writable: WritableLocalHtmlFile | null = null;

  try {
    writable = await handle.createWritable();
    await writable.write(html);
    await writable.close();
  } catch (error) {
    await abortWritable(writable);
    throw error;
  }
}

export async function savePreparedLocalHtml(
  options: SavePreparedLocalHtmlOptions = {}
): Promise<SavePreparedLocalHtmlResult> {
  const access = options.access ?? getCurrentFileSystemAccess();
  if (!isWritableLocalHtmlPage(options.location, access)) {
    return { kind: PagePreparationLocalSaveResultKind.Unsupported };
  }

  try {
    const handle = options.fileHandle ?? (await selectWritableHandle(access, options));
    if (!handle) {
      return { kind: PagePreparationLocalSaveResultKind.Unsupported };
    }

    if (!(await ensureWritablePermission(handle))) {
      return { kind: PagePreparationLocalSaveResultKind.PermissionDenied };
    }

    const builder = options.buildSnapshotDocument ?? buildPreparedSnapshotDocument;
    const snapshot = await builder({ contextLabel: 'local-html-save' });
    await writeHtmlToHandle(handle, snapshot.html);
    return {
      fileHandle: handle,
      kind: PagePreparationLocalSaveResultKind.Saved,
      warnings: snapshot.warnings,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return { kind: PagePreparationLocalSaveResultKind.Cancelled };
    }

    const message = getErrorMessage(error);
    return {
      kind: PagePreparationLocalSaveResultKind.Error,
      ...(message === undefined ? {} : { message }),
    };
  }
}
