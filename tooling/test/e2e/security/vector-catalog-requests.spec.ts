import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import {
  enableCatalogSource,
  openCatalogEditor,
  searchCatalogFromUi,
  startVectorCatalogSource,
} from './vector-catalog.helpers';

const cards = (page: Page) => page.locator('[data-ui="editor.elements.card"]');
type Source = Awaited<ReturnType<typeof startVectorCatalogSource>>;
const requestCount = (source: Source, route: string) =>
  source.requests.filter((request) => request.pathname.endsWith(`/${route}`)).length;

async function eligibleCards(page: Page): Promise<string[]> {
  return cards(page).evaluateAll((elements) => {
    const first = elements[0];
    if (!first) return [];
    let owner = first.parentElement;
    while (owner && !/(auto|scroll)/u.test(getComputedStyle(owner).overflowY))
      owner = owner.parentElement;
    if (!owner) throw new Error('Catalog has no actual scroll owner');
    const bounds = owner.getBoundingClientRect();
    return elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom >= bounds.top - 72 && rect.top <= bounds.bottom + 72;
      })
      .map((element) => element.getAttribute('aria-label') ?? '');
  });
}

async function scrollResultsToEnd(page: Page): Promise<void> {
  await cards(page)
    .first()
    .evaluate((first) => {
      let owner = first.parentElement;
      while (owner && !/(auto|scroll)/u.test(getComputedStyle(owner).overflowY))
        owner = owner.parentElement;
      if (!owner) throw new Error('Catalog has no actual scroll owner');
      owner.scrollTop = owner.scrollHeight;
    });
}

async function waitForEligiblePreviews(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const eligible = await eligibleCards(page);
      if (!eligible.length) return false;
      for (const key of eligible) {
        if (!(await page.getByRole('button', { name: key, exact: true }).locator('img').count()))
          return false;
      }
      return true;
    })
    .toBe(true);
}

async function proveSearchBudget(page: Page, source: Source): Promise<void> {
  await searchCatalogFromUi(page, 'item');
  await expect(cards(page)).toHaveCount(64);
  await expect.poll(() => source.artworkRequests.length).toBe(2);
  const firstEligible = await eligibleCards(page);
  expect(firstEligible.length).toBeLessThan(64);
  expect(source.artworkKeys.flat().every((key) => firstEligible.includes(key))).toBe(true);
  expect(source.maxActiveArtwork).toBe(2);
  source.releaseArtwork();
  await waitForEligiblePreviews(page);
  const beforeScroll = new Set(source.artworkKeys.flat());
  expect(beforeScroll.size).toBeLessThan(64);
  expect(requestCount(source, 'collection')).toBe(0);
  expect(requestCount(source, 'search')).toBe(1);

  await scrollResultsToEnd(page);
  await waitForEligiblePreviews(page);
  const afterScroll = source.artworkKeys.flat();
  expect(afterScroll.some((key) => !beforeScroll.has(key))).toBe(true);
  expect(new Set(afterScroll).size).toBe(afterScroll.length);
  expect(source.artworkRequests.every((batch) => batch.length <= 32)).toBe(true);
  expect(source.maxActiveArtwork).toBeLessThanOrEqual(2);
  const beforeSelection = source.requests.length;
  await cards(page).last().click();
  const details = page.getByRole('button', { name: 'Source and license', exact: true });
  if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
  await expect(page.locator('[data-ui="editor.elements.source-notice"]')).toContainText('MIT');
  await page.locator('[data-ui="editor.elements.appearance-trigger"]').click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(cards(page).last().locator('img')).toBeVisible();
  expect(source.requests).toHaveLength(beforeSelection);
  expect(requestCount(source, 'collection')).toBe(0);
}

async function proveCollectionReuse(page: Page, source: Source): Promise<void> {
  const search = page.getByRole('searchbox', { name: 'Search icons', exact: true });
  await search.fill('');
  await search.press('Enter');
  await page.getByRole('button', { name: 'Filter collections', exact: true }).click();
  await page.getByRole('option', { name: 'Proof elements', exact: true }).click();
  await expect(cards(page)).toHaveCount(64);
  await waitForEligiblePreviews(page);
  expect(requestCount(source, 'collection')).toBe(1);
  await scrollResultsToEnd(page);
  await waitForEligiblePreviews(page);
  expect(requestCount(source, 'collection')).toBe(1);
  await cards(page).last().click();
  const details = page.getByRole('button', { name: 'Source and license', exact: true });
  if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
  await expect(page.locator('[data-ui="editor.elements.source-notice"]')).toContainText('MIT');
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`catalog request budget and reuse at ${viewport.width}x${viewport.height}`, async ({}, info) => {
    test.setTimeout(90_000);
    const source = await startVectorCatalogSource({ requestBudget: true });
    let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | null = null;
    try {
      launched = await launchExtensionBrowser({ ignoreHTTPSErrors: true, viewport });
      await launched.context.addInitScript(() => {
        localStorage.setItem('sniptale-locale-preference', 'en');
      });
      const page = await openCatalogEditor(launched.context, launched.extensionId, viewport);
      await enableCatalogSource(page, source.baseUrl, 'accept');
      await expect.poll(() => requestCount(source, 'collections')).toBe(1);
      await proveSearchBudget(page, source);
      await proveCollectionReuse(page, source);
      expect(requestCount(source, 'collections')).toBe(1);
      await writeFile(
        info.outputPath('catalog-request-counts.json'),
        JSON.stringify(
          {
            viewport,
            requests: source.requests,
            artworkKeys: source.artworkKeys,
            maxActiveArtwork: source.maxActiveArtwork,
          },
          null,
          2
        )
      );
      await page.screenshot({
        path: info.outputPath('catalog-request-budget.png'),
        fullPage: false,
      });
    } finally {
      source.releaseArtwork();
      if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
      await source.close();
    }
  });
}
