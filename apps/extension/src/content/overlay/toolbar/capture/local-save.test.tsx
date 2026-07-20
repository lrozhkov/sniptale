// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolbarLocalSaveControl } from './local-save';

const savePreparedLocalHtmlMock = vi.hoisted(() => vi.fn());

vi.mock('../../../parser/page-preparation/local-save', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../parser/page-preparation/local-save')>()),
  savePreparedLocalHtml: savePreparedLocalHtmlMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderLocalSaveControl() {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ToolbarLocalSaveControl />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  Reflect.deleteProperty(window, 'showSaveFilePicker');
  savePreparedLocalHtmlMock.mockReset();
  vi.unstubAllGlobals();
});

describe('ToolbarLocalSaveControl on non-local pages', () => {
  it('stays hidden on non-local pages even when the picker API exists', () => {
    renderLocalSaveControl();

    expect(
      container?.querySelector('[data-ui="content.toolbar.local-html-save-button"]')
    ).toBeNull();
  });
});
