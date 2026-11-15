import { expect, it, vi } from 'vitest';
import {
  devSurfaceProfileFromUrl,
  parseDevSurfaceConfig,
  prepareDevSurface,
  verifyDevSurfaceFixtureDigest,
  type DevSurfaceConfig,
} from './dev-surface';

const digest = 'a'.repeat(64);
const config: DevSurfaceConfig = {
  profile: 'video-editor',
  id: null,
  locale: 'en',
  theme: 'dark',
  fixtureUrl: '/__dev_surface/fixture',
  fixtureDigest: digest,
};
const candidate = {
  id: 'project',
  width: 1920,
  height: 1080,
  backupRootKey: 'video-project:project',
};
const empty = () => ({ image: [], gallery: [], video: [], scenario: [] });
function fixture() {
  const inventory = { ...empty(), video: [candidate] };
  const ports = {
    prepareAdapters: vi.fn(async (): Promise<void> => {}),
    prepareCatalogs: vi.fn(async (): Promise<void> => {}),
    readInventory: vi.fn(async () => inventory),
    restoreFixture: vi.fn(async () => ['video-project:project']),
    readImported: vi.fn(() => null),
    writeImported: vi.fn(),
    setPage: vi.fn(),
    mount: vi.fn(async (): Promise<void> => {}),
  };
  return { inventory, ports };
}
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('awaits adapters, catalogs, and the complete import before selecting or mounting the page', async () => {
  const { ports } = fixture();
  const adapters = deferred(),
    catalogs = deferred(),
    restore = deferred();
  ports.prepareAdapters.mockImplementation(() => adapters.promise);
  ports.prepareCatalogs.mockImplementation(() => catalogs.promise);
  ports.restoreFixture.mockImplementation(async () => {
    await restore.promise;
    return ['video-project:project'];
  });
  const pending = prepareDevSurface(config, ports);
  expect(ports.readInventory).not.toHaveBeenCalled();
  adapters.resolve();
  await vi.waitFor(() => expect(ports.prepareCatalogs).toHaveBeenCalledWith(config));
  expect(ports.restoreFixture).not.toHaveBeenCalled();
  expect(ports.readInventory).not.toHaveBeenCalled();
  expect(ports.mount).not.toHaveBeenCalled();
  catalogs.resolve();
  await vi.waitFor(() => expect(ports.restoreFixture).toHaveBeenCalledOnce());
  expect(ports.mount).not.toHaveBeenCalled();
  expect(ports.writeImported).not.toHaveBeenCalled();
  restore.resolve();
  await expect(pending).resolves.toEqual({
    selectedId: 'project',
    composition: { width: 1920, height: 1080 },
  });
  expect(ports.setPage).toHaveBeenCalledWith('video-editor', candidate);
  expect(ports.writeImported).toHaveBeenCalledWith(digest, {
    image: [],
    gallery: [],
    video: ['project'],
    scenario: [],
  });
  expect(ports.mount).toHaveBeenCalledOnce();
});
it('leaves stored roots and rendering untouched when catalog preparation fails', async () => {
  const { ports } = fixture();
  ports.prepareCatalogs.mockRejectedValueOnce(new Error('Catalog unavailable'));
  await expect(prepareDevSurface(config, ports)).rejects.toThrow('Catalog unavailable');
  expect(ports.restoreFixture).not.toHaveBeenCalled();
  expect(ports.readInventory).not.toHaveBeenCalled();
  expect(ports.setPage).not.toHaveBeenCalled();
  expect(ports.mount).not.toHaveBeenCalled();
});
it('preserves completed roots on import failure and leaves retry and mount under caller control', async () => {
  const { inventory, ports } = fixture();
  inventory.video = [];
  ports.restoreFixture.mockImplementation(async () => {
    inventory.video.push(candidate);
    throw new Error('Refused after one committed root');
  });
  await expect(prepareDevSurface(config, ports)).rejects.toThrow(
    'Refused after one committed root'
  );
  expect(inventory.video).toEqual([candidate]);
  expect(ports.writeImported).not.toHaveBeenCalled();
  expect(ports.setPage).not.toHaveBeenCalled();
  expect(ports.mount).not.toHaveBeenCalled();
  ports.restoreFixture.mockResolvedValue(['video-project:project']);
  await expect(prepareDevSurface(config, ports)).resolves.toMatchObject({ selectedId: 'project' });
  expect(ports.mount).toHaveBeenCalledOnce();
});
it('reuses a successful digest marker without replacing edited roots or importing again', async () => {
  const { ports } = fixture();
  const remembered = { image: [], gallery: [], video: ['project'], scenario: [] };
  const reused = { ...ports, readImported: vi.fn(() => remembered) };
  await expect(prepareDevSurface(config, reused)).resolves.toMatchObject({ selectedId: 'project' });
  expect(ports.restoreFixture).not.toHaveBeenCalled();
  expect(ports.writeImported).not.toHaveBeenCalled();
});
it('refuses an unsuitable archive instead of selecting an unrelated existing project', async () => {
  const { ports } = fixture();
  ports.restoreFixture.mockResolvedValue(['media:library-item:audio']);
  await expect(prepareDevSurface(config, ports)).rejects.toThrow('no suitable root');
  expect(ports.mount).not.toHaveBeenCalled();
  await expect(prepareDevSurface({ ...config, id: 'project' }, ports)).resolves.toMatchObject({
    selectedId: 'project',
  });
});
it('refuses an explicit missing identity and permits the production empty state without a fixture', async () => {
  const { ports } = fixture();
  await expect(prepareDevSurface({ ...config, id: 'missing' }, ports)).rejects.toThrow(
    'identity is unavailable'
  );
  expect(ports.mount).not.toHaveBeenCalled();
  const noFixture = { ...ports, readInventory: vi.fn(async () => empty()) };
  await expect(
    prepareDevSurface({ ...config, id: null, fixtureUrl: null, fixtureDigest: null }, noFixture)
  ).resolves.toEqual({ selectedId: null, composition: null });
  expect(ports.mount).toHaveBeenCalledOnce();
});
it('derives profile before runtime configuration and preserves explicit URL overrides', () => {
  const url = new URL(
    'http://localhost/apps/extension/src/gallery/index.html?mode=edit&id=chosen&locale=ru&theme=light'
  );
  expect(devSurfaceProfileFromUrl(url)).toBe('gallery-editor');
  expect(parseDevSurfaceConfig(config, url)).toMatchObject({
    profile: 'gallery-editor',
    id: 'chosen',
    locale: 'ru',
    theme: 'light',
  });
  expect(() =>
    parseDevSurfaceConfig({ ...config, fixtureUrl: 'https://other.invalid/archive.zip' }, url)
  ).toThrow('fixture configuration');
  expect(() => devSurfaceProfileFromUrl(new URL('http://localhost/?profile=unknown'))).toThrow(
    'unsupported'
  );
  expect(
    parseDevSurfaceConfig(
      config,
      new URL(
        'http://localhost/apps/extension/src/video-editor/index.html?project=converted&id=source-recording'
      )
    )
  ).toMatchObject({ id: 'converted' });
});
it('rejects changed ZIP bytes before archive import can mutate local data', async () => {
  const blob = new Blob(['fixture']);
  const expected = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
  await expect(verifyDevSurfaceFixtureDigest(blob, expected)).resolves.toBeUndefined();
  const { ports } = fixture();
  const importArchive = vi.fn();
  ports.restoreFixture.mockImplementation(async () => {
    await verifyDevSurfaceFixtureDigest(blob, digest);
    importArchive();
    return ['video-project:project'];
  });
  await expect(prepareDevSurface(config, ports)).rejects.toThrow('fixture changed');
  expect(importArchive).not.toHaveBeenCalled();
  expect(ports.writeImported).not.toHaveBeenCalled();
  expect(ports.mount).not.toHaveBeenCalled();
});
