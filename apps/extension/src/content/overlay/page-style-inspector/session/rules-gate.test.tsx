// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import { dispatchPageStyleInspectorOpen } from '../../../selection/quick-edit/page-style-events';
import { useInspectorOpenState } from './hooks';

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useInspectorOpenState> | null = null;

function Harness() {
  latest = useInspectorOpenState(false);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__', {
    configurable: true,
    value: false,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  latest = null;
  Reflect.deleteProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__');
  vi.unstubAllGlobals();
});

it('opens release-gated rules targets on the properties tab', () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<Harness />);
  });
  act(() => {
    dispatchPageStyleInspectorOpen(PAGE_STYLE_INSPECTOR_TABS.RULES);
  });

  expect(latest?.open).toBe(true);
  expect(latest?.activeTab).toBe(PAGE_STYLE_INSPECTOR_TABS.PROPERTIES);
});
