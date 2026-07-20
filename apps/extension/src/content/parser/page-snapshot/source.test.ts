// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { resolvePageSnapshotSource } from './source';

let originalWindowDescriptor: PropertyDescriptor | undefined;

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    originalWindowDescriptor = undefined;
  }
});

function removeAmbientWindow(): void {
  originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'window');
}

function installThrowingAmbientWindowLocation(): void {
  originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      get location() {
        throw new Error('ambient window location must not be read');
      },
    },
  });
}

it('uses explicit snapshot source metadata without reading ambient window', () => {
  const snapshotDocument = document.implementation.createHTMLDocument('Snapshot Title');
  snapshotDocument.body.append(snapshotDocument.createElement('main'));

  removeAmbientWindow();

  expect(() =>
    resolvePageSnapshotSource({
      document: snapshotDocument,
      pageHostname: 'snapshot.example',
      pageTitle: 'Saved snapshot',
      pageUrl: 'https://snapshot.example/source',
      root: snapshotDocument.body,
    })
  ).not.toThrow();
});

it('does not read ambient viewer location when explicit snapshot metadata is complete', () => {
  const snapshotDocument = document.implementation.createHTMLDocument('Snapshot Title');
  snapshotDocument.body.append(snapshotDocument.createElement('main'));

  installThrowingAmbientWindowLocation();

  expect(
    resolvePageSnapshotSource({
      document: snapshotDocument,
      pageHostname: 'snapshot.example',
      pageTitle: 'Saved snapshot',
      pageUrl: 'https://snapshot.example/source',
      root: snapshotDocument.body,
    })
  ).toEqual(
    expect.objectContaining({
      pageHostname: 'snapshot.example',
      pageUrl: 'https://snapshot.example/source',
    })
  );
});

it('rejects detached explicit sources without adopting ambient viewer URL', () => {
  const snapshotDocument = document.implementation.createHTMLDocument('Snapshot Title');
  snapshotDocument.body.append(snapshotDocument.createElement('main'));
  window.history.replaceState({}, '', '/apps/extension/src/web-snapshot-viewer/index.html');

  expect(() =>
    resolvePageSnapshotSource({
      document: snapshotDocument,
      root: snapshotDocument.body,
    })
  ).toThrow('Cannot build page snapshot without a page URL.');
});
