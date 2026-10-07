// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { SettingsCollectionProps } from '../../../../section-surface/collection/types';
const io = vi.hoisted(() => ({
  edit: vi.fn(),
  add: vi.fn(),
  props: null as SettingsCollectionProps | null,
}));
vi.mock('../../../../../composition/background-resources/catalog', () => ({
  useBackgroundCatalog: () => ({
    status: 'ready',
    edit: io.edit,
    add: io.add,
    presets: [
      {
        id: 'builtin:one',
        name: 'Built-in',
        enabled: true,
        bundled: true,
        available: true,
        url: '/one.webp',
      },
      {
        id: 'user:one',
        name: 'Custom',
        enabled: true,
        bundled: false,
        available: false,
        mediaId: 'gone',
      },
    ],
  }),
}));
vi.mock('../../../../../composition/background-resources/library', () => ({
  BackgroundLibraryThumbnail: () => null,
}));
vi.mock('../../../../../composition/background-resources/picker', () => ({
  BackgroundImagePicker: (props: { onSelect(image: { file: File }): Promise<void> }) => (
    <button onClick={() => void props.onSelect({ file: new File(['x'], 'bg.png') })}>
      pick-upload
    </button>
  ),
}));
vi.mock('../../../../section-surface', () => ({
  settingsModalClassName: '',
  SettingsCollection: (props: SettingsCollectionProps) => {
    io.props = props;
    return null;
  },
}));
import { BackgroundPresetsSettings } from './view';
import { translate } from '../../../../../platform/i18n';
it('marks bundled entries and offers custom editing without exposing built-in editing', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BackgroundPresetsSettings />));
    expect(io.props!.items[0]).toMatchObject({
      isBuiltIn: true,
      capabilities: { edit: false, delete: false, toggle: true, reorder: true },
    });
    expect(io.props!.items[1]).toMatchObject({
      isBuiltIn: false,
      capabilities: { edit: true, delete: true },
    });
    await act(async () =>
      io.props!.onAction?.({ type: 'toggle', itemId: 'builtin:one', nextChecked: false })
    );
    expect(io.edit).toHaveBeenCalledWith({ type: 'toggle', id: 'builtin:one' });
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('renames, reorders, removes and adds custom presets, reporting failed writes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.edit.mockResolvedValue(undefined);
  io.add.mockResolvedValue(undefined);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BackgroundPresetsSettings />));
    await act(async () =>
      io.props!.onMove?.({
        groupId: null,
        source: 'keyboard',
        itemId: 'user:one',
        beforeItemId: 'builtin:one',
      })
    );
    expect(io.edit).toHaveBeenLastCalledWith({ type: 'reorder', ids: ['user:one', 'builtin:one'] });
    await act(async () =>
      io.props!.onMove?.({
        groupId: null,
        source: 'keyboard',
        itemId: 'builtin:one',
        beforeItemId: null,
      })
    );
    await act(async () => io.props!.onAction?.({ type: 'edit', itemId: 'user:one' }));
    const input = host.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Renamed'
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === translate('common.actions.save'))
        ?.click()
    );
    expect(io.edit).toHaveBeenLastCalledWith({ type: 'rename', id: 'user:one', name: 'Renamed' });
    await act(async () => io.props!.addAction?.onInvoke());
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === 'pick-upload')
        ?.click()
    );
    expect(io.add).toHaveBeenCalled();
    io.edit.mockRejectedValueOnce(new Error('failed'));
    await act(async () => io.props!.onAction?.({ type: 'delete', itemId: 'user:one' }));
    expect(host.querySelector('[role=alert]')).not.toBeNull();
    await act(async () => io.props!.addAction?.onInvoke());
    await act(async () => host.querySelector<HTMLButtonElement>('.sniptale-modal-close')?.click());
    expect(host.querySelector('.sniptale-modal')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
