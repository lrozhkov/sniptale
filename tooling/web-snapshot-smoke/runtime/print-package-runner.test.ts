import { describe, expect, it } from 'vitest';
// @vitest-environment jsdom

import { installPrintSmokeLifecycleHook, verifyPrintCoverage } from './print-package-runner.mjs';

function createElement(overrides: Record<string, unknown> = {}) {
  return {
    clientHeight: 100,
    display: 'block',
    height: 100,
    hiddenByAncestor: false,
    overflowY: 'auto',
    position: 'static',
    scrollHeight: 300,
    tag: 'DIV',
    width: 800,
    x: 0,
    y: 50,
    ...overrides,
  };
}

describe('Web Snapshot print package coverage', () => {
  it('dispatches beforeprint before retaining the disposable projection', () => {
    const originalRemove = globalThis.Element.prototype.remove;
    const originalPrint = Object.getOwnPropertyDescriptor(globalThis, 'print');
    let lifecycleState: boolean | null = null;
    const onBeforePrint = () => {
      lifecycleState = Reflect.get(globalThis, '__sniptaleSmokePrintRequested') === true;
    };
    globalThis.addEventListener('beforeprint', onBeforePrint);
    try {
      installPrintSmokeLifecycleHook();

      globalThis.print();

      expect(lifecycleState).toBe(false);
      expect(Reflect.get(globalThis, '__sniptaleSmokePrintRequested')).toBe(true);
    } finally {
      globalThis.Element.prototype.remove = originalRemove;
      globalThis.removeEventListener('beforeprint', onBeforePrint);
      Reflect.deleteProperty(globalThis, '__sniptaleSmokePrintRequested');
      if (originalPrint) Object.defineProperty(globalThis, 'print', originalPrint);
      else Reflect.deleteProperty(globalThis, 'print');
    }
  });

  it('rejects a projection that leaves an internal scroll region clipped', () => {
    const coverage = verifyPrintCoverage(
      { documentHeight: 200, elements: [createElement()], textLength: 100 },
      { documentHeight: 200, elements: [createElement()], textLength: 100 }
    );

    expect(coverage.requiredDocumentHeight).toBe(350);
    expect(coverage.documentHeightCoverage).toBeLessThan(0.99);
    expect(coverage.unexpandedScrollRegions).toHaveLength(1);
  });

  it('accepts an expanded scroll region whose bottom contributes to the print document', () => {
    const coverage = verifyPrintCoverage(
      { documentHeight: 200, elements: [createElement()], textLength: 100 },
      {
        documentHeight: 350,
        elements: [createElement({ height: 300, overflowY: 'visible' })],
        textLength: 100,
      }
    );

    expect(coverage.documentHeightCoverage).toBe(1);
    expect(coverage.unexpandedScrollRegions).toEqual([]);
  });

  it('allows authored print CSS to hide a screen-only scroll region', () => {
    const coverage = verifyPrintCoverage(
      { documentHeight: 400, elements: [createElement()], textLength: 100 },
      {
        documentHeight: 250,
        elements: [createElement({ height: 0, hiddenByAncestor: true })],
        textLength: 80,
      }
    );

    expect(coverage.documentHeightCoverage).toBe(250);
    expect(coverage.scrollRegions[0]).toMatchObject({ expanded: true, hidden: true });
    expect(coverage.textRetentionRatio).toBe(0.8);
    expect(coverage.unexpandedScrollRegions).toEqual([]);
  });
});
