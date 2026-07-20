// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreparedSnapshotWarningKind } from '../snapshot';
import {
  createLocalHtmlSavePickerOptions,
  isWritableLocalHtmlPage,
  PagePreparationLocalSaveResultKind,
  savePreparedLocalHtml,
  type LocalHtmlFileSystemAccess,
  type LocalHtmlSaveLocation,
  type WritableLocalHtmlFileHandle,
} from '.';

const LOCAL_HTML_LOCATION: LocalHtmlSaveLocation = {
  href: 'file:///Users/test/prepared.html',
  pathname: '/Users/test/prepared.html',
  protocol: 'file:',
};

function createAccess(
  handle: WritableLocalHtmlFileHandle,
  picker = vi.fn(async () => handle)
): LocalHtmlFileSystemAccess & { showSaveFilePicker: typeof picker } {
  return { showSaveFilePicker: picker };
}

function createHandle(params?: {
  permission?: 'denied' | 'granted' | 'prompt';
  write?: (html: string) => Promise<void>;
}) {
  const write = vi.fn(params?.write ?? (async () => undefined));
  const close = vi.fn(async () => undefined);
  const abort = vi.fn(async () => undefined);
  const createWritable = vi.fn(async () => ({ abort, close, write }));
  const permission = params?.permission ?? 'granted';
  const handle = {
    createWritable,
    name: 'prepared.html',
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
  } satisfies WritableLocalHtmlFileHandle;

  return {
    abort,
    close,
    createWritable,
    handle,
    requestPermission: handle.requestPermission,
    write,
  };
}

function createSnapshotBuilder(html = '<!doctype html><html><body>Edited text</body></html>') {
  return vi.fn(async () => ({
    document,
    html,
    warnings: [
      {
        kind: PreparedSnapshotWarningKind.IframeUnreadable,
        message: 'Iframe skipped',
      },
    ],
  }));
}

function registerEligibilityTests(): void {
  it('detects writable local HTML pages conservatively', () => {
    const handle = createHandle().handle;
    const access = createAccess(handle);
    const httpLocation = {
      href: 'https://example.test/page.html',
      pathname: '/page.html',
      protocol: 'https:',
    };

    expect(isWritableLocalHtmlPage(LOCAL_HTML_LOCATION, access)).toBe(true);
    const textLocation = {
      ...LOCAL_HTML_LOCATION,
      href: 'file:///Users/test/note.txt',
      pathname: '/note.txt',
    };

    expect(isWritableLocalHtmlPage(textLocation, access)).toBe(false);
    expect(isWritableLocalHtmlPage(httpLocation, access)).toBe(false);
    expect(isWritableLocalHtmlPage(LOCAL_HTML_LOCATION, {})).toBe(false);
  });

  it('uses the local HTML filename as the picker suggestion', () => {
    expect(createLocalHtmlSavePickerOptions(LOCAL_HTML_LOCATION).suggestedName).toBe(
      'prepared.html'
    );
  });
}

function registerWriteTests(): void {
  it('requests a first file handle and writes canonical prepared HTML', async () => {
    const html = '<main>Edited text</main><div data-virtual-iframe="true">Frame</div>';
    const handle = createHandle();
    const access = createAccess(handle.handle);
    const buildSnapshotDocument = createSnapshotBuilder(html);

    const result = await savePreparedLocalHtml({
      access,
      buildSnapshotDocument,
      location: LOCAL_HTML_LOCATION,
    });

    expect(access.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'prepared.html' })
    );
    expect(handle.write).toHaveBeenCalledWith(html);
    expect(handle.close).toHaveBeenCalledOnce();
    expect(result).toEqual(
      expect.objectContaining({
        fileHandle: handle.handle,
        kind: PagePreparationLocalSaveResultKind.Saved,
        warnings: [expect.objectContaining({ message: 'Iframe skipped' })],
      })
    );
  });

  it('reuses a permission-granted handle without opening the picker again', async () => {
    const handle = createHandle();
    const access = createAccess(handle.handle);

    await savePreparedLocalHtml({
      access,
      buildSnapshotDocument: createSnapshotBuilder(),
      fileHandle: handle.handle,
      location: LOCAL_HTML_LOCATION,
    });

    expect(access.showSaveFilePicker).not.toHaveBeenCalled();
    expect(handle.write).toHaveBeenCalledWith(expect.stringContaining('Edited text'));
  });
}

function registerFailureTests(): void {
  it('returns permission denied before mutating the selected file', async () => {
    const handle = createHandle({ permission: 'denied' });

    const result = await savePreparedLocalHtml({
      access: createAccess(handle.handle),
      buildSnapshotDocument: createSnapshotBuilder(),
      fileHandle: handle.handle,
      location: LOCAL_HTML_LOCATION,
    });

    expect(result).toEqual({ kind: PagePreparationLocalSaveResultKind.PermissionDenied });
    expect(handle.createWritable).not.toHaveBeenCalled();
  });

  it('reports write failure and aborts the writable stream when possible', async () => {
    const handle = createHandle({
      write: async () => {
        throw new Error('disk full');
      },
    });

    const result = await savePreparedLocalHtml({
      access: createAccess(handle.handle),
      buildSnapshotDocument: createSnapshotBuilder(),
      fileHandle: handle.handle,
      location: LOCAL_HTML_LOCATION,
    });

    expect(result).toEqual({
      kind: PagePreparationLocalSaveResultKind.Error,
      message: 'disk full',
    });
    expect(handle.abort).toHaveBeenCalledOnce();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('page-preparation local HTML save service', () => {
  registerEligibilityTests();
  registerWriteTests();
  registerFailureTests();
});
