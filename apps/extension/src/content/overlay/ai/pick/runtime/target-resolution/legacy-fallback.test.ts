// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TargetRef } from '@sniptale/runtime-contracts/dom-tree';
import { findElementWithLegacyFallback } from './legacy-fallback';

const mocks = vi.hoisted(() => ({
  selector: vi.fn(),
  targetLookup: vi.fn(),
}));

vi.mock('../../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/frame')>()),
  findElementBySelector: mocks.selector,
}));

vi.mock('./target-lookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./target-lookup')>()),
  findElementByTarget: mocks.targetLookup,
}));

afterEach(() => {
  document.body.replaceChildren();
  mocks.selector.mockReset();
  mocks.targetLookup.mockReset();
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

describe('legacy-fallback', () => {
  it('returns target lookup matches before any legacy fallback', () => {
    const target = document.createElement('div');
    mocks.targetLookup.mockReturnValue(target);

    expect(
      findElementWithLegacyFallback(
        'node-id',
        buildTargetRef({ selectors: ['.selector'] }),
        '.legacy'
      )
    ).toBe(target);
    expect(mocks.selector).not.toHaveBeenCalled();
  });

  it('falls back to selector, id, and data attribute in order', () => {
    const selectorTarget = document.createElement('div');
    const idTarget = document.createElement('section');
    const attrTarget = document.createElement('span');
    attrTarget.setAttribute('data-sniptale-id', 'node-id');
    document.body.append(attrTarget);

    mocks.targetLookup.mockReturnValue(null);
    mocks.selector.mockImplementation((selector: string) =>
      selector === '.legacy' ? selectorTarget : null
    );

    expect(findElementWithLegacyFallback('node-id', undefined, '.legacy')).toBe(selectorTarget);

    mocks.selector.mockReturnValue(null);
    document.body.replaceChildren(idTarget);
    idTarget.id = 'node-id';

    expect(findElementWithLegacyFallback('node-id', undefined)).toBe(idTarget);

    document.body.replaceChildren(attrTarget);
    expect(findElementWithLegacyFallback('node-id', undefined)).toBe(attrTarget);
  });
});

describe('legacy-fallback sniptale id safety', () => {
  it('escapes node ids before using the legacy data attribute fallback', () => {
    const specialId = 'node-"] [data-sniptale-id="other';
    const attrTarget = document.createElement('span');
    attrTarget.setAttribute('data-sniptale-id', specialId);
    document.body.append(attrTarget);

    mocks.targetLookup.mockReturnValue(null);
    mocks.selector.mockReturnValue(null);

    expect(findElementWithLegacyFallback(specialId, undefined)).toBe(attrTarget);
  });
});
