import { describe, expect, it, vi } from 'vitest';
import { parseStoredSettings } from './guards';

describe('toolbar placement preferences', () => {
  it.each(['top', 'bottom', 'left', 'right'])(
    'restores the %s dock and free placement preference',
    (dockEdge) => {
      expect(
        parseStoredSettings({
          contentToolbar: {
            freePlacement: true,
            dockEdge,
            displayMode: 'vertical',
            compactMenus: true,
            position: { x: 20, y: 30 },
          },
        }).value
      ).toMatchObject({
        contentToolbar: {
          freePlacement: true,
          dockEdge,
          displayMode: 'vertical',
          position: { x: 20, y: 30 },
        },
      });
    }
  );
  it('keeps legacy preferences readable without inventing a free-placement opt-in', () => {
    expect(
      parseStoredSettings({
        contentToolbar: { displayMode: 'vertical', position: { x: 20, y: 30 } },
      }).value
    ).toMatchObject({ contentToolbar: { displayMode: 'vertical', position: { x: 20, y: 30 } } });
    expect(
      parseStoredSettings({ contentToolbar: {} }).value.contentToolbar?.freePlacement
    ).toBeUndefined();
  });
  it.each([{ freePlacement: 'yes' }, { dockEdge: 'center' }])(
    'rejects malformed toolbar placement values',
    (contentToolbar) => {
      expect(parseStoredSettings({ contentToolbar }).value.contentToolbar).toBeUndefined();
    }
  );
});

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() },
    sync: {
      get: vi.fn(async () => storage.value),
      set: vi.fn(async (value: Record<string, unknown>) => {
        Object.assign(storage.value, value);
      }),
      remove: vi.fn(),
    },
  },
}));

it('round-trips docking preferences and preserves them in unrelated nested patches', async () => {
  const { patchSettings, loadSettings } = await import('./index');
  await patchSettings({
    contentToolbar: {
      freePlacement: true,
      dockEdge: 'right',
      displayMode: 'vertical',
      position: { x: 80, y: 40 },
    },
  });
  await patchSettings({ contentToolbar: { compactMenus: true } });
  expect((await loadSettings()).contentToolbar).toMatchObject({
    freePlacement: true,
    dockEdge: 'right',
    displayMode: 'vertical',
    compactMenus: true,
    position: { x: 80, y: 40 },
  });
});
