import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { EditorDocument } from '../../../../apps/extension/src/features/editor/document/types';
import {
  computeEditorVectorDefinitionDigest,
  createEditorVectorInstance,
  isEditorVectorDefinition,
  validateEditorVectorDefinitionDigest,
} from '../../../../apps/extension/src/features/editor/document/vector-element';
import legacyFixtureValues from '../../../../apps/extension/src/editor/objects/vector-elements/prepare.accepted-fixtures.json' with { type: 'json' };
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

const legacyFixtures = legacyFixtureValues.map((row) => {
  if (!isEditorVectorDefinition(row.definition)) throw new Error('Invalid legacy fixture');
  return { name: row.name, source: row.source, definition: row.definition };
});
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const attack = 'window.__svgSanitizationExecutions=1';
const hostileBodies = [
  `<script>${attack}</script><path d="M0 0h20v20z"/>`,
  `<image href="https://svg-sanitization.invalid/resource"/><path d="M0 0h20v20z"/>`,
  `<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>` +
    '<path d="M0 0h20v20z"/>',
  `<path d="M0 0h20v20z" onload="${attack}"/>`,
];
const ui = (page: Page, suffix: string) => page.locator(`[data-ui="editor.elements.${suffix}"]`);

declare global {
  interface Window {
    __svgSanitizationExecutions?: number;
    __svgSanitizationViolations?: string[];
  }
}

async function ready(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
    )
    .toBe(true);
  await expect(page.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
}

async function openFixture(
  page: Page,
  hostOrigin: string,
  viewport: { width: number; height: number }
) {
  await page.setViewportSize(viewport);
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing canvas context');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  });
  await page.addInitScript((source) => {
    const preserve = sessionStorage.getItem('svg-sanitization-opened') === '1';
    sessionStorage.setItem('svg-sanitization-opened', '1');
    window.__sniptaleHarnessBootstrap = {
      storage: { 'sniptale-locale-preference': 'en' },
      editorBootstrapPayload: { dataUrl: source, title: 'SVG sanitization proof' },
      preserveMediaLibrary: preserve,
      editorDispatchBootstrapPayload: !preserve,
    };
    localStorage.setItem('sniptale-locale-preference', 'en');
    window.__svgSanitizationExecutions = 0;
    window.__svgSanitizationViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__svgSanitizationViolations?.push(event.blockedURI);
    });
  }, dataUrl);
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await ready(page);
  await page.locator('[data-ui="editor.floating.layers.mode.elements"]').click();
  await expect(ui(page, 'panel')).toBeVisible();
}

async function importCorpus(page: Page) {
  await ui(page, 'import-input').setInputFiles([
    ...legacyFixtures.map((row) => ({
      name: `${row.name}.svg`,
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(row.source),
    })),
    ...hostileBodies.map((body, index) => ({
      name: `refused-${index}.svg`,
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(svg(body)),
    })),
    {
      name: 'refused-icons.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          prefix: 'refused',
          width: 100,
          height: 100,
          icons: { unsafe: { body: hostileBodies[0] } },
        })
      ),
    },
  ]);
  await expect(ui(page, 'management')).toBeVisible();
  for (let index = 0; index < hostileBodies.length; index++)
    await expect(ui(page, 'management')).toContainText(`refused-${index}.svg`);
  await expect(ui(page, 'management')).toContainText('refused-icons.json');
  await page.getByRole('button', { name: 'Back to elements', exact: true }).click();
  await expect(ui(page, 'card')).toHaveCount(legacyFixtures.length);
  await expect(ui(page, 'card').locator('img')).toHaveCount(legacyFixtures.length);
  await ui(page, 'card').first().click();
  await ui(page, 'add').click();
  await expect(page.locator('[data-ui="editor.vector.properties"]')).toBeVisible();
}

function withLegacyDefinitions(document: EditorDocument): EditorDocument {
  const canvas: unknown = JSON.parse(document.canvasJson);
  if (!isRecord(canvas) || !Array.isArray(canvas['objects'])) throw new Error('Invalid canvas');
  const objects: unknown[] = canvas['objects'];
  const template = objects.find(
    (value) => isRecord(value) && value['sniptaleType'] === 'vector-element'
  );
  if (!isRecord(template)) throw new Error('Missing inserted vector template');
  const vectors = legacyFixtures.map(({ definition }, index) => ({
    ...template,
    sniptaleId: randomUUID(),
    left: 100 + (index % 5) * 150,
    top: 100 + Math.floor(index / 5) * 180,
    width: definition.viewBox.width,
    height: definition.viewBox.height,
    scaleX: 1,
    scaleY: 1,
    angle: index % 2 === 0 ? 0 : 12,
    opacity: 1,
    sniptaleVectorElement: createEditorVectorInstance(definition.id),
    objects: [],
  }));
  return {
    ...document,
    version: 4,
    vectorDefinitions: Object.fromEntries(
      legacyFixtures.map(({ definition }) => [definition.id, definition])
    ),
    canvasJson: JSON.stringify({
      ...canvas,
      objects: [
        ...objects.filter(
          (value) => !isRecord(value) || value['sniptaleType'] !== 'vector-element'
        ),
        ...vectors,
      ],
    }),
  };
}

async function observation(page: Page) {
  return page.evaluate(async () => {
    const harness = window.__sniptaleEditorHarness!;
    return {
      document: harness.exportDocument(),
      image: await harness.renderImage(),
      geometry: harness.getCanvasObjects(),
      historyIndex: harness.getInteractionState().historyIndex,
    };
  });
}

async function refuseForgedDefinitions(page: Page, accepted: EditorDocument) {
  const baseline = await observation(page);
  const first = legacyFixtures[0]!.definition;
  for (const body of hostileBodies) {
    const forged = { ...first, svg: svg(body), id: '' };
    forged.id = await computeEditorVectorDefinitionDigest(forged);
    expect(isEditorVectorDefinition(forged)).toBe(true);
    expect(await validateEditorVectorDefinitionDigest(forged)).toBe(true);
    const canvas: unknown = JSON.parse(accepted.canvasJson);
    if (!isRecord(canvas) || !Array.isArray(canvas['objects'])) throw new Error('Invalid canvas');
    const definitions = { ...accepted.vectorDefinitions };
    delete definitions[first.id];
    definitions[forged.id] = forged;
    const document: EditorDocument = {
      ...accepted,
      vectorDefinitions: definitions,
      canvasJson: JSON.stringify({
        ...canvas,
        objects: canvas['objects'].map((value: unknown) => {
          if (
            !isRecord(value) ||
            !isRecord(value['sniptaleVectorElement']) ||
            value['sniptaleVectorElement']['definitionId'] !== first.id
          )
            return value;
          return { ...value, sniptaleVectorElement: createEditorVectorInstance(forged.id) };
        }),
      }),
    };
    const refused = await page.evaluate(async (value) => {
      try {
        await window.__sniptaleEditorHarness!.loadDocument(value);
        return null;
      } catch (error) {
        return error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'unclassified-refusal';
      }
    }, document);
    expect(['unsafe-svg', 'unsupported-svg']).toContain(refused);
    expect(await observation(page)).toEqual(baseline);
  }
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`SVG import and stored definition security ${viewport.name}`, async ({
    page,
    context,
    hostOrigin,
  }, info) => {
    const outbound: string[] = [];
    const dialogs: string[] = [];
    context.on('request', (request) => {
      const url = new URL(request.url());
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== hostOrigin)
        outbound.push(request.url());
    });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== hostOrigin
        ? route.abort('blockedbyclient')
        : route.continue();
    });
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await openFixture(page, hostOrigin, viewport.size);
    await importCorpus(page);
    const legacy = withLegacyDefinitions(
      await page.evaluate(() => window.__sniptaleEditorHarness!.exportDocument())
    );
    await page.evaluate(
      (document) => window.__sniptaleEditorHarness!.loadDocument(document),
      legacy
    );
    const accepted = await observation(page);
    expect(accepted.document.vectorDefinitions).toEqual(legacy.vectorDefinitions);
    expect(
      accepted.geometry.filter((value) => value['sniptaleType'] === 'vector-element')
    ).toHaveLength(10);
    await refuseForgedDefinitions(page, accepted.document);
    await expect(page.locator('[data-ui="autosave-control"] button')).toHaveAttribute(
      'aria-label',
      'Autosave: Saved'
    );
    await page.reload();
    await ready(page);
    const reloaded = await observation(page);
    expect(reloaded.document).toEqual(accepted.document);
    expect(reloaded.image).toBe(accepted.image);
    expect(reloaded.geometry).toEqual(accepted.geometry);
    await context.setOffline(true);
    try {
      await page.evaluate(
        (document) => window.__sniptaleEditorHarness!.loadDocument(document),
        accepted.document
      );
      expect((await observation(page)).image).toBe(accepted.image);
    } finally {
      await context.setOffline(false);
    }
    const security = await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      return {
        executions: window.__svgSanitizationExecutions,
        violations: window.__svgSanitizationViolations,
      };
    });
    expect(security).toEqual({ executions: 0, violations: [] });
    expect(outbound).toEqual([]);
    expect(dialogs).toEqual([]);
    await page.screenshot({ path: info.outputPath('svg-legacy-restored.png'), fullPage: false });
  });
}
