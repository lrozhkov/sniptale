import { expect, it, vi } from 'vitest';

import { applyLoadedTabs, createTabsFingerprint } from './selection';
import type { PopupExportTabItem } from './types';

function tabs(count: number): PopupExportTabItem[] {
  return Array.from({ length: count }, (_, index) => ({
    disabledReason: index === count - 1 ? 'blocked' : null,
    isCurrent: index === 0,
    tabId: index + 1,
    title: `Tab ${index + 1}`,
    url: `https://example.test/${index + 1}`,
  }));
}

function apply(args: {
  currentSelected: number[];
  fingerprint: string | null;
  nextTabs: PopupExportTabItem[];
  persistedSelection: { selectedTabIds: number[]; tabsFingerprint: string } | null;
}) {
  let selected: number[] = [];
  const fingerprintRef = { current: args.fingerprint };
  const hasHydratedSelectionRef = { current: false };
  applyLoadedTabs({
    fingerprintRef,
    hasHydratedSelectionRef,
    nextTabs: args.nextTabs,
    persistedSelection: args.persistedSelection,
    setAvailableTabs: vi.fn(),
    setSelectedTabIds: (update) => {
      selected = typeof update === 'function' ? update(args.currentSelected) : update;
    },
  });
  return { fingerprintRef, hasHydratedSelectionRef, selected };
}

it('retains only available exportable selections and caps the unchanged list', () => {
  const nextTabs = tabs(260);
  const fingerprint = createTabsFingerprint(nextTabs);
  const result = apply({
    currentSelected: Array.from({ length: 260 }, (_, index) => index + 1),
    fingerprint,
    nextTabs,
    persistedSelection: null,
  });

  expect(result.selected).toHaveLength(256);
  expect(result.selected).not.toContain(260);
});

it('hydrates only matching, exportable persisted selections within the canonical cap', () => {
  const nextTabs = tabs(260);
  const fingerprint = createTabsFingerprint(nextTabs);
  const result = apply({
    currentSelected: [],
    fingerprint: null,
    nextTabs,
    persistedSelection: {
      selectedTabIds: [999, ...Array.from({ length: 260 }, (_, index) => index + 1)],
      tabsFingerprint: fingerprint,
    },
  });

  expect(result.selected).toHaveLength(256);
  expect(result.selected).not.toContain(999);
  expect(result.selected).not.toContain(260);
  expect(result.fingerprintRef.current).toBe(fingerprint);
  expect(result.hasHydratedSelectionRef.current).toBe(true);
});
