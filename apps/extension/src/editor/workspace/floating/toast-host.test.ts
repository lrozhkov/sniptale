// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  configureToastHostAdapter,
  type ToastHostAdapter,
} from '@sniptale/ui/product-feedback/toast-service';
import { installEditorToastHostAdapter } from './toast-host';

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  configureToastHostAdapter: vi.fn(),
}));

afterEach(() => {
  document.querySelector('[data-ui="editor.floating.tool-rail.history"]')?.remove();
  document.querySelector('[data-ui="editor.floating-workspace"]')?.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('positions notifications with history after resize and workspace inset changes', async () => {
  const workspace = document.createElement('div');
  workspace.dataset['ui'] = 'editor.floating-workspace';
  document.body.appendChild(workspace);
  const history = document.createElement('div');
  history.dataset['ui'] = 'editor.floating.tool-rail.history';
  document.body.appendChild(history);
  let rectTop = 660;
  vi.spyOn(history, 'getBoundingClientRect').mockImplementation(() => ({
    left: rectTop > 500 ? 12 : 810,
    top: rectTop,
    right: 220,
    bottom: rectTop + 44,
    width: 208,
    height: 44,
    x: 12,
    y: rectTop,
    toJSON: () => ({}),
  }));
  vi.stubGlobal('innerHeight', 720);
  const dispose = installEditorToastHostAdapter();
  const adapter = vi.mocked(configureToastHostAdapter).mock.calls[0]?.[0] as ToastHostAdapter;
  expect(adapter.getHostStyle?.(0)).toMatchObject({ left: '12px', bottom: '72px', top: 'auto' });
  expect(adapter.getHostStyle?.(1)).toMatchObject({ bottom: '136px' });

  rectTop = 12;
  expect(adapter.getHostStyle?.(0)).toMatchObject({ left: '810px', top: '68px', bottom: 'auto' });
  const reposition = vi.fn();
  const unsubscribe = adapter.subscribePositionChanges?.(reposition);
  window.dispatchEvent(new Event('resize'));
  expect(reposition).toHaveBeenCalledOnce();
  workspace.style.setProperty('--editor-floating-edge-bottom', '15px');
  await Promise.resolve();
  expect(reposition).toHaveBeenCalledTimes(2);
  unsubscribe?.();
  window.dispatchEvent(new Event('resize'));
  workspace.style.setProperty('--editor-floating-edge-bottom', '0px');
  await Promise.resolve();
  expect(reposition).toHaveBeenCalledTimes(2);

  history.remove();
  expect(adapter.getHostStyle?.(0)).toMatchObject({ right: '20px', top: '60px' });
  dispose();
  expect(configureToastHostAdapter).toHaveBeenLastCalledWith(null);
});
