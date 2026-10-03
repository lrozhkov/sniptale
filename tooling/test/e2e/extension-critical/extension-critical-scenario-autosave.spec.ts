import { test, expect } from '../support/extension-fixture';
import {
  createGuideProject,
  createGuideStep,
} from '../../../../apps/extension/src/features/scenario/project/factories';

test('coalesces typing, keeps AI available, and retains the last edit through a protected close', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  const project = createGuideProject('Autosave proof', 'autosave-proof', 1000);
  project.items = [createGuideStep('First step', 'first-step')];
  await page.evaluate(async (project) => {
    await chrome.storage.local.set({ 'sniptale-locale-preference': 'en' });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('scenario_projects', 'readwrite');
    tx.objectStore('scenario_projects').put({
      id: project.id,
      project,
      createdAt: 1000,
      updatedAt: 1000,
      workspaceRevision: 1,
      lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, project);
  const url = `chrome-extension://${extensionId}/apps/extension/src/scenario-editor/index.html?projectId=autosave-proof`;
  await page.goto(url);
  const name = page.getByRole('textbox', { name: 'Scenario', exact: true });
  await expect(name).toHaveValue('Autosave proof');
  const readSaved = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row: unknown = await new Promise((resolve, reject) => {
        const request = db
          .transaction('scenario_projects')
          .objectStore('scenario_projects')
          .get('autosave-proof');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      if (!row || typeof row !== 'object' || !('workspaceRevision' in row) || !('project' in row))
        throw new Error('Missing project');
      const project = row.project;
      if (!project || typeof project !== 'object' || !('name' in project))
        throw new Error('Missing name');
      return { revision: row.workspaceRevision, name: project.name };
    });
  await name.fill('');
  await name.pressSequentially('ABCD', { delay: 400 });
  await expect(page.getByRole('button', { name: 'AI assistance', exact: true })).toBeEnabled();
  expect(await readSaved()).toEqual({ revision: 1, name: 'Autosave proof' });
  await page.getByRole('textbox', { name: 'Step title', exact: true }).focus();
  await expect.poll(readSaved).toEqual({ revision: 2, name: 'ABCD' });
  await name.fill('Latest draft');
  await page.getByRole('button', { name: 'AI assistance', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await name.fill('Final text before close');
  const dialogPromise = page.waitForEvent('dialog');
  const closeAttempt = page.close({ runBeforeUnload: true });
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await closeAttempt;
  expect(page.isClosed()).toBe(false);
  await expect.poll(async () => (await readSaved()).name).toBe('Final text before close');
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await expect(reopened.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
    'Final text before close'
  );
  await reopened.close();
});
