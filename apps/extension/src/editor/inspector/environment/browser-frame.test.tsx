// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const acquisition = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('../../../workflows/browser-frame/favicon', () => ({
  acquireWindowHeaderFavicon: acquisition.acquire,
}));
import type { BrowserFrameState } from '../../../features/editor/document/types';
import { DEFAULT_BROWSER_FRAME_STATE } from '../../../features/editor/document/constants';
import { useEditorStore } from '../../state/useEditorStore';
import { translate } from '../../../platform/i18n';
import {
  EditorWindowHeaderSettings,
  EditorInspectorBrowserFramePanelContent,
} from './browser-frame';

it('offers shared browser and application settings with explicit image insertion and no mount fetch', async () => {
  useEditorStore.setState({
    browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE, enabled: true },
    layers: [{ type: 'source-image', id: 'source-one' }] as never,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const syncBrowserFrame = vi.fn();
  const insert = vi.fn();
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    await act(async () =>
      root.render(
        <EditorInspectorBrowserFramePanelContent
          browserCanvasModeOptions={[{ label: 'Resize', value: 'resize' }]}
          browserContentModeOptions={[{ label: 'Push down', value: 'push-down' }]}
          browserFrame={{
            ...DEFAULT_BROWSER_FRAME_STATE,
            title: 'Saved title',
            url: 'example.com',
          }}
          syncBrowserFrame={syncBrowserFrame}
          insertOrUpdateBrowserFrame={insert}
        />
      )
    );
    expect(container.querySelector('[data-ui="window-header-settings"]')).not.toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(Array.from(container.querySelectorAll('input')).map((input) => input.value)).toEqual([
      'Saved title',
      'example.com',
    ]);
    const application = Array.from(container.querySelectorAll('button')).find((button) =>
      /Application|Приложение/.test(button.textContent ?? '')
    );
    expect(application).toBeDefined();
    await act(async () => application?.click());
    expect(syncBrowserFrame).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'application', title: 'Saved title', faviconDataUrl: null })
    );
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
    fetch.mockRestore();
  }
});

afterEach(() => useEditorStore.setState({ sessionId: null, layers: [] }));

it('routes Off to existing removal and activates a header from Off without persisting another flag', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const sync = vi.fn();
  try {
    useEditorStore.setState({
      browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE, enabled: true },
      layers: [{ type: 'source-image', id: 'source' }] as never,
    });
    await act(async () =>
      root.render(
        <EditorWindowHeaderSettings
          browserFrame={DEFAULT_BROWSER_FRAME_STATE}
          syncBrowserFrame={sync}
        />
      )
    );
    const off = Array.from(container.querySelectorAll('button')).find((button) =>
      /^(Off|Нет|Выкл|Выключено)/.test(button.textContent ?? '')
    );
    expect(off).toBeDefined();
    await act(async () => off?.click());
    expect(sync).toHaveBeenLastCalledWith({ enabled: false });
    await act(async () =>
      useEditorStore.setState({
        browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE, enabled: false },
        layers: [],
      })
    );
    expect(container.querySelectorAll('input')).toHaveLength(0);
    const browser = Array.from(container.querySelectorAll('button')).find((button) =>
      /Browser|Браузер/.test(button.textContent ?? '')
    );
    await act(async () => browser?.click());
    expect(sync).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, kind: 'browser' })
    );
  } finally {
    act(() => root.unmount());
  }
});

it('aborts pending favicon acquisition when a different document has the same URL', async () => {
  let resolve: (value: string) => void = () => undefined;
  let signal: AbortSignal | undefined;
  acquisition.acquire.mockImplementation((_url, requestSignal) => {
    signal = requestSignal;
    return new Promise<string>((done) => {
      resolve = done;
    });
  });
  const writes = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  function Harness() {
    const [frame, setFrame] = useState<BrowserFrameState>({
      ...DEFAULT_BROWSER_FRAME_STATE,
      url: 'example.com',
    });
    return (
      <EditorWindowHeaderSettings
        browserFrame={frame}
        syncBrowserFrame={(patch) => {
          writes(patch);
          setFrame((previous) => ({ ...previous, ...patch }));
        }}
      />
    );
  }
  try {
    useEditorStore.setState({
      browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE, enabled: true },
      sessionId: 'document-one',
      layers: [{ type: 'source-image', id: 'source' }] as never,
    });
    await act(async () => root.render(<Harness />));
    const toggle = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${translate('windowHeader.favicon')}"]`
    );
    expect(toggle).not.toBeNull();
    await act(async () => toggle?.click());
    expect(acquisition.acquire).toHaveBeenCalled();
    await act(async () => useEditorStore.setState({ sessionId: 'document-two' }));
    expect(signal?.aborted).toBe(true);
    const writesBeforeResolution = writes.mock.calls.length;
    await act(async () =>
      resolve(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII='
      )
    );
    expect(writes).toHaveBeenCalledTimes(writesBeforeResolution);
  } finally {
    act(() => root.unmount());
  }
});
