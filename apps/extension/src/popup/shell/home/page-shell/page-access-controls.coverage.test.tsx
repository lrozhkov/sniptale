// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';

import { cleanupRenderedNode, getContainer, renderNode } from './popup-home.test.helpers';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { PageAccessControls } from './page-access-controls';

const inactiveStatus = {
  allSitesGranted: false,
  currentTabActive: false,
  currentTabId: 1,
  currentTabOrigin: 'https://example.test',
  siteGranted: false,
  supported: true,
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  cleanupRenderedNode();
  vi.unstubAllGlobals();
});

it('renders pending copy and delegates each supported page-access action', async () => {
  const onRequest = vi.fn();

  await renderNode(
    <PageAccessControls
      disabled={false}
      error="Request failed"
      onRequest={onRequest}
      pendingOperation={PageAccessOperation.ACTIVATE_CURRENT_TAB}
      status={inactiveStatus}
    />
  );

  const buttons = Array.from(getContainer()?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  act(() => buttons.forEach((button) => button.click()));

  expect(getContainer()?.textContent).toContain('popup.home.pageAccessWorking');
  expect(getContainer()?.textContent).toContain('Request failed');
  expect(onRequest.mock.calls.map(([operation]) => operation)).toEqual([
    PageAccessOperation.ACTIVATE_CURRENT_TAB,
    PageAccessOperation.GRANT_SITE,
    PageAccessOperation.GRANT_ALL_SITES,
  ]);
});

it('renders no controls for an active tab without an error', async () => {
  await renderNode(
    <PageAccessControls
      disabled
      error={null}
      onRequest={vi.fn()}
      pendingOperation={null}
      status={{ ...inactiveStatus, currentTabActive: true }}
    />
  );

  expect(getContainer()?.innerHTML).toBe('');
});
