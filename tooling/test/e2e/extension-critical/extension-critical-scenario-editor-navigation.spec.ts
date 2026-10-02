import { test, expect } from '../support/extension-fixture';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../../apps/extension/src/features/scenario/project/factories';
import type { TourNavigationSlide } from '@sniptale/runtime-contracts/scenario/types/tour';

function projectFixture() {
  const project = createGuideProject('Action navigation', 'navigation-proof', 1000);
  project.tour = createTourDocument('navigation-tour');
  const slide = (id: string, ids: string[]): TourNavigationSlide => ({
    kind: 'navigation',
    id,
    title: id,
    description: '',
    background: { color: '#111827', image: null },
    narration: null,
    timing: createTourImageSlide().timing,
    buttons: ids.map((id) => ({ id, label: id, action: { kind: 'none' } })),
  });
  project.tour.slides = [
    slide('First', [
      'one',
      'two',
      ...Array.from({ length: 11 }, (_, index) => `button-${index + 3}`),
    ]),
    slide('Empty', []),
    slide('Last', ['three']),
  ];
  return project;
}

for (const [locale, theme] of [
  ['ru', 'light'],
  ['en', 'dark'],
] as const) {
  test(`authoring action navigation at 1280x720 ${locale}/${theme} preserves the project`, async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
    await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const preference: unknown = (
            await chrome.storage.local.get('sniptale-locale-preference')
          )['sniptale-locale-preference'];
          return preference === 'en' || preference === 'ru';
        })
      )
      .toBe(true);
    await page.evaluate(
      async ({ project, locale, theme }) => {
        await chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        });
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
      },
      { project: projectFixture(), locale, theme }
    );
    await page.goto(
      `chrome-extension://${extensionId}/apps/extension/src/scenario-editor/index.html?projectId=navigation-proof`
    );
    await page
      .getByRole('button', {
        name: locale === 'ru' ? 'Интерактивный тур' : 'Interactive tour',
        exact: true,
      })
      .click();
    const stage = page.locator('.tour-stage-host');
    const player = stage.locator('#tour-player');
    const previous = stage.locator('[data-tour-previous]');
    const next = stage.locator('[data-tour-next]');
    await expect(player).toHaveAttribute('data-slide-id', 'First');
    await expect(previous).toBeDisabled();
    const firstAction = stage.locator('[data-tour-object-id="one"]');
    await firstAction.focus();
    await firstAction.press('Enter');
    await expect(firstAction).toBeFocused();
    await expect(firstAction).toHaveAttribute('data-selected', 'true');
    await next.focus();
    await next.press('Enter');
    await expect(stage.locator('[data-tour-object-id="two"]')).toHaveAttribute(
      'data-selected',
      'true'
    );
    for (let index = 3; index <= 13; index++) await next.click();
    await expect(stage.locator('[data-tour-object-id="button-13"]')).toHaveAttribute(
      'data-selected',
      'true'
    );
    await expect(stage.locator('[data-tour-object-id="button-13"]')).toBeVisible();
    await next.click();
    await expect(player).toHaveAttribute('data-slide-id', 'Empty');
    await expect(next).toBeFocused();
    await next.click();
    await expect(player).toHaveAttribute('data-slide-id', 'Last');
    await expect(stage.locator('[data-tour-object-id="three"]')).toHaveAttribute(
      'data-selected',
      'true'
    );
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(player).toHaveAttribute('data-slide-id', 'Empty');
    await previous.click();
    await expect(stage.locator('[data-tour-object-id="button-13"]')).toHaveAttribute(
      'data-selected',
      'true'
    );
    await expect(stage.locator('[data-tour-object-id="button-13"]')).toBeVisible();
    for (let index = 13; index > 2; index--) await previous.click();
    await expect(stage.locator('[data-tour-object-id="two"]')).toHaveAttribute(
      'data-selected',
      'true'
    );
    await previous.click();
    await expect(previous).toBeDisabled();
    for (const button of [previous, next]) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(28);
      expect(box!.y + box!.height).toBeLessThanOrEqual(720);
      expect(await button.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
        'rgba(0, 0, 0, 0)'
      );
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    const unchanged = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
      });
      const value: unknown = await new Promise((resolve) => {
        const request = db
          .transaction('scenario_projects')
          .objectStore('scenario_projects')
          .get('navigation-proof');
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return JSON.stringify(value);
    });
    expect(JSON.parse(unchanged)).toEqual({
      id: 'navigation-proof',
      project: projectFixture(),
      createdAt: 1000,
      updatedAt: 1000,
      workspaceRevision: 1,
      lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
    });
    await page.screenshot({ path: `.tmp/scenario-navigation-${locale}-${theme}.png` });
    await page.close();
  });
}
