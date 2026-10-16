// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { DrawingSelectionActions } from './selection-actions';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])(
  'preserves selection commands and disabled admission with scope=%s',
  (scoped) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const callbacks = {
      onMove: vi.fn(),
      onDuplicate: vi.fn(),
      onDelete: vi.fn(),
      onDeselect: vi.fn(),
      onGroup: vi.fn(),
      onMerge: vi.fn(),
      onUngroup: vi.fn(),
    };
    const render = (enabled: boolean, ungroup = false) =>
      act(() =>
        root.render(
          <CommandPressScope value={scoped}>
            <DrawingSelectionActions
              {...callbacks}
              vertical
              canReorder={enabled}
              canDuplicate={enabled}
              canDelete={enabled}
              layerCombination={{
                canGroup: enabled,
                canMerge: enabled,
                canUngroup: ungroup,
                showMerge: true,
                onGroup: callbacks.onGroup,
                onMerge: callbacks.onMerge,
                onUngroup: callbacks.onUngroup,
              }}
            />
          </CommandPressScope>
        )
      );
    const button = (suffix: string) =>
      host.querySelector<HTMLButtonElement>(`[data-ui="drawing.selection.actions.${suffix}"]`);
    render(true);
    expect(button('front')?.getAttribute('data-command-chrome')).toBe(scoped ? 'true' : null);
    expect(button('front')?.title).toBe('editor.toolbar.frontLayer');
    expect(button('delete')?.classList.contains('sniptale-btn-danger')).toBe(true);
    const deselect = host.querySelector<HTMLButtonElement>(
      '[data-ui="content.toolbar.drawing-options.deselect"]'
    );
    expect(deselect?.title).toBe('content.toolbar.drawingDeselect');
    act(() => {
      button('front')?.click();
      button('duplicate')?.click();
      button('delete')?.click();
      button('group')?.click();
      button('merge')?.click();
      deselect?.click();
    });
    expect(callbacks.onMove).toHaveBeenCalledExactlyOnceWith('front');
    expect(callbacks.onDuplicate).toHaveBeenCalledTimes(1);
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
    expect(callbacks.onDeselect).toHaveBeenCalledTimes(1);
    expect(callbacks.onGroup).toHaveBeenCalledTimes(1);
    expect(callbacks.onMerge).toHaveBeenCalledTimes(1);
    render(true, true);
    act(() => button('ungroup')?.click());
    expect(callbacks.onUngroup).toHaveBeenCalledTimes(1);
    render(false);
    act(() => {
      button('front')?.click();
      button('duplicate')?.click();
      button('delete')?.click();
      button('group')?.click();
      button('merge')?.click();
    });
    expect(callbacks.onMove).toHaveBeenCalledTimes(1);
    expect(callbacks.onDuplicate).toHaveBeenCalledTimes(1);
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
    expect(callbacks.onGroup).toHaveBeenCalledTimes(1);
    expect(callbacks.onMerge).toHaveBeenCalledTimes(1);
    expect(button('front')?.disabled).toBe(true);
    act(() => root.unmount());
    host.remove();
  }
);
