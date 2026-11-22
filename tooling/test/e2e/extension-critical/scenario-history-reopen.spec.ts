import { expect, test, type Page } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
} from '../extension-critical.helpers';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../../../apps/extension/src/features/scenario/project/factories';
import { createScenarioProjectEntry } from '../../../../apps/extension/src/composition/persistence/scenario/projects/entry';
import { encodeScenarioUnitStorage } from '../../../../apps/extension/src/composition/persistence/scenario/storage-units';
import { parseScenarioProjectEntry } from '../../../../apps/extension/src/composition/persistence/scenario/read-guards';

async function nativeProjection(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('sniptale-db');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction('scenario_projects');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      const raw = await new Promise<unknown>((resolve, reject) => {
        const request = tx.objectStore('scenario_projects').get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await done;
      const record = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value);
      const project = record(raw) && record(raw['project']) ? raw['project'] : null;
      const history = record(raw) && record(raw['editingHistory']) ? raw['editingHistory'] : null;
      return {
        name: project && typeof project['name'] === 'string' ? project['name'] : null,
        past: history && Array.isArray(history['past']) ? history['past'].length : null,
        future: history && Array.isArray(history['future']) ? history['future'].length : null,
        revision:
          record(raw) &&
          typeof raw['workspaceRevision'] === 'number' &&
          Number.isSafeInteger(raw['workspaceRevision'])
            ? raw['workspaceRevision']
            : null,
      };
    } finally {
      db.close();
    }
  }, id);
}

function pooledFixture(id: string) {
  const project = createGuideProject('Pooled current', id, 100);
  const item = createGuideStep('Shared history body', 'shared');
  item.blocks.push({
    kind: 'text',
    id: 'text',
    paragraphs: createGuideParagraphs(Array(30).fill('x'.repeat(10000)).join('\n')),
  });
  const historical = { ...project, items: [item] };
  const entry = {
    ...createScenarioProjectEntry({ existing: undefined, project, updatedAt: 100 }),
    workspaceRevision: 1000,
    editingHistory: {
      version: 1 as const,
      past: Array.from({ length: 25 }, (_, index) => ({ ...historical, name: `Past ${index}` })),
      future: Array.from({ length: 25 }, (_, index) => ({
        ...historical,
        name: `Future ${index}`,
      })),
    },
  };
  expect(parseScenarioProjectEntry(entry)).not.toBeNull();
  return encodeScenarioUnitStorage(entry, []);
}

async function installPooledFixture(page: Page, graph: ReturnType<typeof pooledFixture>) {
  await page.evaluate(async (graph) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('sniptale-db');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction(
        ['scenario_projects', 'scenario_project_history', 'scenario_project_units'],
        'readwrite'
      );
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      for (const name of ['scenario_project_history', 'scenario_project_units']) {
        const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const request = tx.objectStore(name).index('projectId').getAllKeys(graph.head.id);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        for (const key of keys) tx.objectStore(name).delete(key);
      }
      tx.objectStore('scenario_projects').put(graph.head);
      for (const row of graph.rows) tx.objectStore('scenario_project_history').put(row);
      for (const unit of graph.units) tx.objectStore('scenario_project_units').put(unit);
      await done;
    } finally {
      db.close();
    }
  }, graph);
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Scenario preserves native cursor and pooled history after reopening ${viewport.name}`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(60000);
    const host = await startHostServer();
    try {
      const id = `history-reopen-${viewport.name}`;
      let active = page;
      await active.setViewportSize(viewport.size);
      await applyHarnessBootstrap(active, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await active.goto(
        `${host.origin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}?projectId=${id}&locale=en`
      );
      const title = () => active.getByRole('textbox', { name: 'Scenario', exact: true });
      const undo = () => active.getByRole('button', { name: 'Undo', exact: true });
      const redo = () => active.getByRole('button', { name: 'Redo', exact: true });
      await expect(title()).toBeVisible();
      for (const name of ['First action', 'Second action']) {
        await title().fill(name);
        await title().press('Tab');
        await expect.poll(async () => (await nativeProjection(active, id)).name).toBe(name);
      }
      await undo().click();
      await expect
        .poll(async () => nativeProjection(active, id))
        .toMatchObject({ name: 'First action', future: 1 });
      const saved = () => active.getByRole('button', { name: 'Autosave: Saved', exact: true });
      await expect(saved()).toBeVisible();
      const beforeNoop = await nativeProjection(active, id);
      await title().fill('Temporary field value');
      await expect
        .poll(async () => (await nativeProjection(active, id)).name)
        .toBe('Temporary field value');
      await title().fill('First action');
      await expect
        .poll(async () => nativeProjection(active, id))
        .toMatchObject({ name: 'First action', past: beforeNoop.past, future: 1 });
      await expect(saved()).toBeVisible();
      const url = new URL(active.url());
      url.searchParams.set('skipSeed', '1');
      const reopen = async () => {
        await active.close();
        active = await context.newPage();
        await active.setViewportSize(viewport.size);
        await applyHarnessBootstrap(active, {
          preserveMediaLibrary: true,
          storage: { 'sniptale-locale-preference': 'en' },
        });
        await active.goto(url.href);
      };
      await reopen();
      await expect(title()).toHaveValue('First action');
      await expect(redo()).toBeEnabled();
      await redo().click();
      await expect
        .poll(async () => (await nativeProjection(active, id)).name)
        .toBe('Second action');
      await expect(saved()).toBeVisible();
      const accepted = await nativeProjection(active, id);
      await title().fill('Temporary no-op');
      await title().fill('Second action');
      await title().press('Tab');
      await expect(saved()).toBeVisible();
      expect(await nativeProjection(active, id)).toEqual(accepted);
      await active.screenshot({ path: info.outputPath('reopened-redo.png'), fullPage: false });
      await active.close();
      active = await context.newPage();
      await active.setViewportSize(viewport.size);
      await active.goto(host.origin);
      await installPooledFixture(active, pooledFixture(id));
      await reopen();
      await expect(title()).toHaveValue('Pooled current');
      await expect(redo()).toBeEnabled();
      await redo().click();
      await expect
        .poll(async () => nativeProjection(active, id))
        .toEqual({ name: 'Future 0', past: 26, future: 24, revision: expect.any(Number) });
      await undo().click();
      await expect
        .poll(async () => nativeProjection(active, id))
        .toEqual({ name: 'Pooled current', past: 25, future: 25, revision: expect.any(Number) });
      await title().fill('New branch');
      await title().press('Tab');
      await expect
        .poll(async () => nativeProjection(active, id))
        .toEqual({ name: 'New branch', past: 26, future: 0, revision: expect.any(Number) });
      await reopen();
      await expect(title()).toHaveValue('New branch');
      await expect(redo()).toBeDisabled();
      await undo().click();
      await expect(title()).toHaveValue('Pooled current');
      await expect
        .poll(async () => nativeProjection(active, id))
        .toEqual({ name: 'Pooled current', past: 25, future: 1, revision: expect.any(Number) });
      await active.screenshot({
        path: info.outputPath('pooled-branch-reopened.png'),
        fullPage: false,
      });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
