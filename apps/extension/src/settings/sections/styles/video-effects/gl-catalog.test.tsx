// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGlTransitionSelection } from '../../../../features/video/project/transition/gl-catalog';
import type { SettingsCollectionProps } from '../../../section-surface/collection/types';
const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  reload: vi.fn(),
  toggle: vi.fn(),
  builtin: vi.fn(),
  remove: vi.fn(),
  importFiles: vi.fn(),
  confirm: null as null | (() => Promise<void>),
}));
vi.mock('../../../../composition/gl-transition-presets/catalog', () => ({
  useGlTransitionCatalog: mocks.catalog,
}));
vi.mock('../../../../composition/persistence/effect-bundles/gl-presets', () => ({
  setGlPresetCatalogEnabled: mocks.toggle,
  setBuiltinGlTransitionEnabled: mocks.builtin,
  deleteGlPresetCatalogEntry: mocks.remove,
}));
vi.mock('../../../../composition/persistence/effect-bundles/import-files', () => ({
  importEffectFiles: mocks.importFiles,
}));
vi.mock('@sniptale/ui/product-feedback/confirm-dialog', () => ({
  ProductConfirmDialog: (props: { isOpen: boolean; onConfirm: () => Promise<void> }) => {
    mocks.confirm = props.isOpen ? props.onConfirm : null;
    return null;
  },
}));
vi.mock('../../../section-surface', async (original) => ({
  ...(await original<typeof import('../../../section-surface')>()),
  SettingsCollection: (props: SettingsCollectionProps) => (
    <div>
      {props.items.map((item) => (
        <div key={item.id} data-row={item.id}>
          <span>
            {item.title}
            {item.footer}
          </span>
          <button
            data-toggle
            disabled={item.busy || !item.capabilities.toggle}
            onClick={() =>
              props.onAction({ type: 'toggle', itemId: item.id, nextChecked: !item.enabled })
            }
          >
            toggle
          </button>
          {item.capabilities.delete && (
            <button data-delete onClick={() => props.onAction({ type: 'delete', itemId: item.id })}>
              delete
            </button>
          )}
          {item.actions}
        </div>
      ))}
    </div>
  ),
}));
import { GlCatalogSettings } from './gl-catalog';
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
const entry = { source: 'exact retained source' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.catalog.mockReturnValue({
    items: [
      {
        id: 'builtin:Fade',
        name: 'Fade',
        transitionName: 'Fade',
        builtin: true,
        enabled: false,
        status: 'ready',
        selection: createGlTransitionSelection('Fade'),
      },
      {
        id: 'gl.custom',
        name: 'Mine',
        transitionName: 'Fade',
        builtin: false,
        enabled: true,
        status: 'ready',
        selection: createGlTransitionSelection('Fade'),
        entry,
      },
      {
        id: 'gl.future',
        name: 'Future',
        transitionName: 'Fade',
        builtin: false,
        enabled: true,
        status: 'unsupported',
        entry,
      },
    ],
    loading: false,
    error: false,
    reload: mocks.reload,
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('routes independent availability and deletion, retaining unsupported source management', async () => {
  await act(async () => root.render(<GlCatalogSettings />));
  expect(host.querySelector('[data-row="builtin:Fade"] [data-delete]')).toBeNull();
  const future = host.querySelector('[data-row="gl.future"] [data-toggle]') as HTMLButtonElement;
  expect(future.disabled).toBe(true);
  await act(async () =>
    (host.querySelector('[data-row="builtin:Fade"] [data-toggle]') as HTMLButtonElement).click()
  );
  expect(mocks.builtin).toHaveBeenCalledWith('Fade', true);
  await act(async () =>
    (host.querySelector('[data-row="gl.custom"] [data-toggle]') as HTMLButtonElement).click()
  );
  expect(mocks.toggle).toHaveBeenCalledWith('gl.custom', false);
  await act(async () =>
    (host.querySelector('[data-row="gl.future"] [data-delete]') as HTMLButtonElement).click()
  );
  expect(mocks.remove).not.toHaveBeenCalled();
  await act(async () => mocks.confirm?.());
  expect(mocks.remove).toHaveBeenCalledWith('gl.future');
});
it('retains a failed deletion for retry without removing a different source', async () => {
  mocks.remove.mockRejectedValueOnce(new Error('refused')).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<GlCatalogSettings />));
  await act(async () =>
    (host.querySelector('[data-row="gl.custom"] [data-delete]') as HTMLButtonElement).click()
  );
  await act(async () => mocks.confirm?.());
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(mocks.confirm).not.toBeNull();
  await act(async () => mocks.confirm?.());
  expect(mocks.remove.mock.calls).toEqual([['gl.custom'], ['gl.custom']]);
  expect(mocks.confirm).toBeNull();
});
