// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TargetRef } from '@sniptale/runtime-contracts/dom-tree';
import { findElementByTarget, findElementByTargetOrSelector } from './target-lookup';

const mocks = vi.hoisted(() => ({
  selector: vi.fn(),
  sniptale: vi.fn(),
}));

vi.mock('../../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/frame')>()),
  findElementBySelector: mocks.selector,
  findElementBySniptaleId: mocks.sniptale,
}));

afterEach(() => {
  document.body.replaceChildren();
  mocks.selector.mockReset();
  mocks.sniptale.mockReset();
});

function buildTargetRef(overrides: Partial<TargetRef> = {}): TargetRef {
  return {
    realmId: 'realm-1',
    selectors: [],
    anchorStrategy: 'sniptale',
    editable: false,
    ...overrides,
  };
}

describe('target-lookup findElementByTarget', () => {
  it('prefers sniptale id, then selectors, then node id', () => {
    const target = document.createElement('div');
    mocks.sniptale.mockImplementation((id: string) =>
      id === 'target-id' ? { element: target } : null
    );
    mocks.selector.mockImplementation((selector: string) =>
      selector === '.fallback' ? document.createElement('span') : null
    );

    expect(
      findElementByTarget(
        'node-id',
        buildTargetRef({
          sniptaleId: 'target-id',
          selectors: ['.fallback'],
        })
      )
    ).toBe(target);
    expect(mocks.selector).not.toHaveBeenCalled();
  });

  it('falls back to selectors and then node id when sniptale ids miss', () => {
    const fallback = document.createElement('div');
    const nodeTarget = document.createElement('section');
    mocks.sniptale.mockReturnValue(null);
    mocks.selector.mockImplementation((selector: string) =>
      selector === '.fallback' ? fallback : null
    );

    expect(
      findElementByTarget(
        'node-id',
        buildTargetRef({
          selectors: ['.fallback'],
        })
      )
    ).toBe(fallback);

    document.body.append(nodeTarget);
    mocks.selector.mockReset();
    mocks.sniptale.mockImplementation((id: string) =>
      id === 'node-id' ? { element: nodeTarget } : null
    );

    expect(findElementByTarget('node-id')).toBe(nodeTarget);
  });
});

describe('target-lookup sniptale id fallback safety', () => {
  it('escapes node ids before using the legacy data attribute fallback', () => {
    const specialId = 'node-"] [data-sniptale-id="other';
    const target = document.createElement('div');
    target.dataset['sniptaleId'] = specialId;
    document.body.append(target);
    mocks.sniptale.mockReturnValue(null);
    mocks.selector.mockReturnValue(null);

    expect(findElementByTarget(specialId)).toBe(target);
  });
});

describe('target-lookup findElementByTargetOrSelector', () => {
  it('falls back to a direct selector when target resolution misses', () => {
    const selectorTarget = document.createElement('div');
    mocks.sniptale.mockReturnValue(null);
    mocks.selector.mockImplementation((selector: string) =>
      selector === '.field-target' ? selectorTarget : null
    );

    expect(findElementByTargetOrSelector('node-id', buildTargetRef(), '.field-target')).toBe(
      selectorTarget
    );
  });
});
