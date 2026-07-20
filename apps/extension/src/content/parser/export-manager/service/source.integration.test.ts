// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import { createExportManagerService } from '.';

let originalWindowDescriptor: PropertyDescriptor | undefined;
let originalChromeDescriptor: PropertyDescriptor | undefined;

function createExportOptions(): ExportOptions {
  return {
    includeBasicLogs: true,
    includeCssDiagnostics: true,
    includeFiles: true,
    includeFullPageScreenshot: true,
    includeHarDomLogs: true,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
  };
}

function createSnapshotDocument(): Document {
  const snapshotDocument = document.implementation.createHTMLDocument('Saved snapshot title');
  snapshotDocument.body.innerHTML = [
    '<main>',
    '<h1>Saved snapshot page</h1>',
    '<p>This saved snapshot contains enough stable text for generic export parsing.</p>',
    '<p>Export should use explicit snapshot metadata instead of ambient window authority.</p>',
    '<a class="download-link" href="https://snapshot.example/file.pdf" download>Download file</a>',
    '</main>',
  ].join('');
  return snapshotDocument;
}

function removeAmbientWindow(): void {
  originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'window');
}

function installChromeRuntimeStub(): void {
  originalChromeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        getManifest: () => ({
          manifest_version: 3,
          name: 'Sniptale Test',
          version: '0.0.0-test',
        }),
        sendMessage: (message: unknown) => {
          const messageType =
            message && typeof message === 'object' && 'type' in message ? message.type : undefined;
          if (messageType === MessageType.EXPORT_START_HAR) {
            return Promise.resolve({
              capabilityToken: 'har-token',
              expiresAtEpochMs: Date.now() + 1000,
              success: true,
            });
          }

          if (messageType === MessageType.EXPORT_STOP_HAR) {
            return Promise.resolve({
              rawDiagnosticsEnabled: false,
              success: true,
            });
          }

          return Promise.resolve({ success: true });
        },
      },
    },
  });
}

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    originalWindowDescriptor = undefined;
  }
  if (originalChromeDescriptor) {
    Object.defineProperty(globalThis, 'chrome', originalChromeDescriptor);
    originalChromeDescriptor = undefined;
  } else {
    Reflect.deleteProperty(globalThis, 'chrome');
  }
});

it('builds viewer snapshot export packages from explicit source metadata without ambient window', async () => {
  const snapshotDocument = createSnapshotDocument();
  const service = createExportManagerService({
    snapshotSource: {
      document: snapshotDocument,
      pageHostname: 'snapshot.example',
      pageTitle: 'Saved snapshot title',
      pageUrl: 'https://snapshot.example/path',
      root: snapshotDocument.body,
    },
  });

  removeAmbientWindow();
  installChromeRuntimeStub();

  const pagePackage = await service.buildPackage(createExportOptions());

  expect(pagePackage.errors).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Failed to download file.pdf'),
      'Failed to capture full-page screenshot.',
    ])
  );
  expect(pagePackage.errors.join('\n')).not.toContain('window is not defined');
  expect(pagePackage.entries.map((entry) => entry.path)).toEqual(
    expect.arrayContaining([
      'logs/dom.html',
      'logs/page-summary.json',
      'logs/css/computed-styles.json',
    ])
  );
});
