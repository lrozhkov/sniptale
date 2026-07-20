// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { resolveDiagnosticsDocument, resolveOptionalDiagnosticsView } from './source';

let originalWindowDescriptor: PropertyDescriptor | undefined;

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    originalWindowDescriptor = undefined;
  }
});

function installThrowingAmbientWindow(): void {
  originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      get location() {
        throw new Error('ambient diagnostics window must not be read');
      },
    },
  });
}

it('resolves ambient diagnostics document and view for live exports', () => {
  expect(resolveDiagnosticsDocument()).toBe(document);
  expect(resolveOptionalDiagnosticsView()).toBe(window);
});

it('does not use ambient view for explicit detached diagnostics sources', () => {
  const snapshotDocument = document.implementation.createHTMLDocument('Snapshot');
  installThrowingAmbientWindow();

  expect(resolveDiagnosticsDocument({ document: snapshotDocument })).toBe(snapshotDocument);
  expect(resolveOptionalDiagnosticsView({ document: snapshotDocument })).toBeUndefined();
});
