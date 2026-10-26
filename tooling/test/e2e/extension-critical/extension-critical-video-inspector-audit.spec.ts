import { addVideoProjectCommentDocument } from '../../../../apps/extension/src/features/video/project/comments/authoring';
import { addProjectSourceVoiceoverDocument } from '../../../../apps/extension/src/features/video/project/source-voiceover';
import { createVideoProjectTrack } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { anchorReviewVoiceoverAtSource } from '../../../../apps/extension/src/features/video/review/voiceover-edits';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import { formatPreciseTime } from '../../../../apps/extension/src/video-editor/timeline/project/interaction-state/helpers';
import { writeFile } from 'node:fs/promises';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../apps/extension/src/features/video/project/types';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test } from '../support/extension-fixture';
import { createInspectorAuditFixture } from '../support/inspector-audit-fixture';
import {
  checkInspectorLabels,
  checkInspectorPaintedFont,
  checkInspectorParameterRows,
} from '../support/inspector-utilities';
import { seedActionAudioFacts } from '../support/action-audio-fixture';
import { textModelResponse } from '../support/text-rewrite-fixture';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import {
  EFFECT_V1_STANDALONE_FIXTURE,
  EFFECT_V1_TARGET_FIXTURE,
  EFFECT_V1_TRANSITION_FIXTURE,
  countPersistedEffectInstances,
  importEffectFile,
} from './extension-critical-video-effects.helpers';

const INSPECTOR = '[data-ui="video-editor.inspector.content"]';
const SHELL = '[data-ui="video-editor.floating.context-inspector"]';
const TOGGLE = '[data-ui="video-editor.inspector.presentation-toggle"]';
const variants = [
  { size: PRIMARY_BROWSER_VIEWPORTS[0].size, locale: 'en', theme: 'dark' },
  { size: PRIMARY_BROWSER_VIEWPORTS[0].size, locale: 'ru', theme: 'light' },
  { size: PRIMARY_BROWSER_VIEWPORTS[1].size, locale: 'ru', theme: 'dark' },
  { size: PRIMARY_BROWSER_VIEWPORTS[1].size, locale: 'en', theme: 'light' },
] as const;

type AuditVariant = (typeof variants)[number];

for (const variant of variants) {
  test(`inspector clip and track parameter audit ${variant.size.width} ${variant.locale} ${variant.theme}`, async ({
    page,
    hostOrigin,
  }, info) => {
    test.setTimeout(300_000);
    const fixture = await openAuditProject(page, hostOrigin, variant);
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const inventory: unknown[] = [];
    await selectAndAudit(
      page,
      info,
      inventory,
      'scene',
      page.getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
    );
    for (const clip of fixture.project.clips) {
      await selectAuditClip(page, clip, variant.locale);
      await auditSelection(
        page,
        info,
        inventory,
        `clip-${clip.type}-${clip.id}`,
        fixture.captureClipIds.has(clip.id)
      );
    }
    for (const [index, track] of fixture.project.tracks.entries()) {
      await selectAndAudit(
        page,
        info,
        inventory,
        `track-${track.kind}-${track.role ?? index}`,
        page
          .locator('[data-ui="video-editor.timeline.track-select"]')
          .filter({ hasText: track.name })
          .first()
      );
    }
    await saveAuditInventory(info, variant, 'clips-and-tracks', inventory);
  });

  test(`inspector utility and text parameter audit ${variant.size.width} ${variant.locale} ${variant.theme}`, async ({
    page,
    hostOrigin,
  }, info) => {
    test.setTimeout(300_000);
    const fixture = await openAuditProject(page, hostOrigin, variant);
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const inventory: unknown[] = [];
    await auditUtilitySelections(page, info, inventory, fixture, variant.locale);
    await auditTextEditing(
      page,
      info,
      fixture.text,
      fixture.text.text,
      label('videoEditor.sidebar.textLabel'),
      variant.locale
    );
    await auditNarrowChoices(page, info, inventory);
    await auditTextZoom(page, info, 'text');
    await selectAuditClip(page, fixture.modern[0]!, variant.locale);
    await openAllDetails(page.locator(INSPECTOR));
    await auditTextZoom(page, info, 'annotation');
    await auditSceneText(page, info, inventory, label);
    await auditImportedEffects(page, info, inventory, fixture, variant.locale);
    await auditExport(page, info, inventory, label);
    await page.setViewportSize({ width: 1100, height: 560 });
    const workspace = page.locator('[data-ui="video-editor.workspace.root"]');
    await expect.poll(() => workspace.evaluate((node) => node.scrollWidth)).toBeGreaterThan(1100);
    await workspace.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    await expect.poll(() => workspace.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    await page.screenshot({
      path: info.outputPath('below-minimum-horizontal-scroll.png'),
      fullPage: false,
    });
    await saveAuditInventory(info, variant, 'utilities-text-effects-export', inventory);
  });
}

for (const variant of [variants[0], { ...variants[2], theme: 'light' }] as const) {
  test(`expanded inspector uses only meaningful columns ${variant.size.width} ${variant.locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    test.setTimeout(300_000);
    const fixture = await openAuditProject(page, hostOrigin, variant);
    await setInspectorWidth(page, 800);
    const panel = page.locator(INSPECTOR);
    const inventory: unknown[] = [];
    const checkSelection = async (selection: string) => {
      if (!(await panel.locator('[data-presentation="all"]').count()))
        await page.locator(TOGGLE).click();
      await openAllDetails(panel);
      await checkAndCaptureAllLayout(page, panel, info, selection);
    };
    await page
      .getByRole('button', {
        name: translate('videoEditor.sidebar.sceneProperties', variant.locale),
        exact: true,
      })
      .click();
    await checkSelection('scene');
    for (const clip of fixture.project.clips) {
      await selectAuditClip(page, clip, variant.locale);
      await checkSelection(`clip-${clip.type}-${clip.id}`);
    }
    for (const track of fixture.project.tracks) {
      await page
        .locator('[data-ui="video-editor.timeline.track-select"]')
        .filter({ hasText: track.name })
        .first()
        .click();
      await checkSelection(`track-${track.kind}-${track.id}`);
    }
    await auditUtilitySelections(page, info, inventory, fixture, variant.locale);
    await saveAuditInventory(info, variant, 'expanded-columns', inventory);
  });
}

for (const variant of [variants[0], { ...variants[2], theme: 'light' }] as const) {
  test(`expanded inspector note and source voiceover audit ${variant.size.width} ${variant.locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    test.setTimeout(300_000);
    await openAuditProject(page, hostOrigin, variant, withAuditNoteAndVoiceover);
    await setInspectorWidth(page, 800);
    const inventory: unknown[] = [];
    await page
      .getByRole('button', {
        name:
          `${translate('videoEditor.sidebar.commentNote', variant.locale)} · ` +
          `${formatPreciseTime(2)} · Inspector audit note`,
        exact: true,
      })
      .click();
    await expect(page.locator('[data-ui="video-editor.comment.inspector"]')).toBeVisible();
    await auditSelection(page, info, inventory, 'comment');
    const take = page.locator('[data-source-voiceover-document="audit-source-voice"]').first();
    await take.scrollIntoViewIfNeeded();
    await take.click();
    await expect(page.locator('[data-ui="video-editor.inspector.source-voiceover"]')).toBeVisible();
    await auditSelection(page, info, inventory, 'source-voiceover');
    await saveAuditInventory(info, variant, 'note-and-source-voiceover', inventory);
  });
}

test('expanded inspector imported effect groups audit 1920', async ({ page, hostOrigin }, info) => {
  test.setTimeout(300_000);
  const variant = variants[3];
  const fixture = await openAuditProject(page, hostOrigin, variant);
  await setInspectorWidth(page, 800);
  const inventory: unknown[] = [];
  await auditImportedEffects(page, info, inventory, fixture, variant.locale);
  await saveAuditInventory(info, variant, 'expanded-imported-effects', inventory);
});

/** Add admitted editorial documents without changing the shared fixture's existing selections. */
function withAuditNoteAndVoiceover(project: VideoProject): VideoProject {
  const note = addVideoProjectCommentDocument(project, {
    id: 'audit-notes',
    target: { kind: 'project' },
    note: {
      id: 'audit-note',
      text: 'Inspector audit note',
      anchor: { kind: 'range', start: 2, end: 5 },
    },
  });
  if (!note.ok) throw new Error('Inspector note fixture refused');
  const video = note.project.clips.find((clip) => clip.type === 'VIDEO');
  const audio = note.project.assets.find((asset) => asset.type === 'AUDIO');
  if (!video || video.type !== 'VIDEO' || !audio)
    throw new Error('Missing voiceover fixture sources');
  const track = createVideoProjectTrack(
    'Inspector source voice',
    note.project.tracks.length,
    'AUDIO'
  );
  const reference = buildReviewTimeMap(12, []);
  const voice = addProjectSourceVoiceoverDocument(
    { ...note.project, tracks: [...note.project.tracks, track] },
    {
      id: 'audit-source-voice',
      enabled: true,
      trackId: track.id,
      binding: {
        kind: 'source',
        assetId: video.assetId,
        sourceInstanceId: video.sourceInstanceId ?? video.id,
      },
      reference,
      take: anchorReviewVoiceoverAtSource(
        {
          id: 'audit-source-take',
          assetId: audio.id,
          timelineStart: 0,
          sourceOffset: 0,
          duration: 2,
          tempo: 1,
          volume: 0.8,
          muted: false,
          fadeIn: 0.1,
          fadeOut: 0.2,
        },
        reference
      ),
    }
  );
  if (!voice.ok) throw new Error('Inspector source voiceover fixture refused');
  return voice.project;
}

/** Supporting metadata and commands must not reserve a second parameter column. */
async function checkAndCaptureAllLayout(page: Page, panel: Locator, info: TestInfo, name: string) {
  const body = panel.locator('[data-ui="video-editor.inspector.body"]');
  const all = panel.locator('[data-presentation="all"]');
  const containerWidth = () =>
    body.evaluate((node) => {
      const style = getComputedStyle(node);
      return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
  if (!(await all.count()) || (await containerWidth()) < 524) return;
  const shellWidth = (await page.locator(SHELL).boundingBox())!.width;
  const widths =
    name === 'object-track' || name === 'transition-junction' || name === 'motion-region'
      ? [null, 523, 524, 525]
      : [null];
  try {
    for (const width of widths) {
      if (width !== null) {
        const current = await containerWidth();
        const shell = (await page.locator(SHELL).boundingBox())!.width;
        await setInspectorWidth(page, shell + width - current);
        await expect.poll(containerWidth).toBe(width);
      }
      const geometry = await all.evaluate((root) => {
        const box = root.getBoundingClientRect();
        const sections = [...root.querySelectorAll(':scope > section')].map((section) => {
          const rect = section.getBoundingClientRect();
          return { id: section.getAttribute('data-section'), x: rect.x, width: rect.width };
        });
        return { width: box.width, sections };
      });
      const parameters = geometry.sections.filter(
        (section) => section.id !== 'info' && section.id !== 'actions'
      );
      const fullWidth = parameters.length <= 1 || (width !== null && width < 524);
      expect(
        await body.evaluate((node) => node.scrollWidth - node.clientWidth),
        name
      ).toBeLessThanOrEqual(1);
      for (const section of geometry.sections) {
        if (fullWidth)
          expect(
            Math.abs(section.width - geometry.width),
            `${name}: ${section.id}`
          ).toBeLessThanOrEqual(1);
        else expect(section.width, `${name}: ${section.id}`).toBeLessThan(geometry.width * 0.6);
      }
      await body.evaluate((node) => {
        node.scrollTop = 0;
      });
      await page.screenshot({
        path: info.outputPath(`${name}-all-${width ?? 'wide'}-top.png`),
        fullPage: false,
      });
    }
  } finally {
    await setInspectorWidth(page, shellWidth);
  }
}

async function openAuditProject(
  page: Page,
  hostOrigin: string,
  variant: AuditVariant,
  decorate?: (project: VideoProject) => VideoProject
) {
  page.setDefaultTimeout(10_000);
  const fixture = createInspectorAuditFixture();
  if (decorate) fixture.project = decorate(fixture.project);
  await page.setViewportSize({ ...variant.size });
  await page.emulateMedia({ colorScheme: variant.theme });
  await applyHarnessBootstrap(page, {
    apiBehavior: { runtimeFallback: 'typed-success' },
    videoProjects: [fixture.project],
    runtimeResponses: { AI_SETTINGS_QUERY: textModelResponse },
    recordings: [
      {
        id: 'audit-image',
        filename: 'audit.svg',
        mimeType: 'image/svg+xml',
        bytes:
          '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#286b8a"/></svg>',
      },
    ],
    storage: {
      'sniptale-locale-preference': variant.locale,
      'sniptale-theme-preference': variant.theme,
    },
  });
  await page.addInitScript((locale) => {
    if (window === window.top) localStorage.setItem('sniptale-locale-preference', locale);
  }, variant.locale);
  const url = `${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}?project=${fixture.project.id}&theme=${variant.theme}`;
  await page.goto(url);
  await expect(page.locator(INSPECTOR)).toBeVisible();
  await seedActionAudioFacts(page);
  await page.reload();
  await expect(page.locator(`[data-project-timeline-clip="${fixture.text.id}"]`)).toBeVisible();
  await expect(page.locator('[data-action-id="audit-click"]')).toHaveCount(1);
  await expect(page.locator('[data-action-id="audit-key"]')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
  await page.evaluate(() => document.fonts.ready);
  await setInspectorWidth(page, 320);
  return fixture;
}

async function saveAuditInventory(
  info: TestInfo,
  variant: AuditVariant,
  scope: string,
  inventory: unknown[]
) {
  await writeFile(
    info.outputPath(`inspector-${scope}-inventory.json`),
    JSON.stringify(
      {
        variant,
        scope,
        inspectorWidth: 320,
        coverage:
          'Every supported fixture selection, available category, and expanded ' +
          'disclosure. Retired SUBTITLE timeline capability is excluded; document ' +
          'captions remain covered. Dedicated flow specs cover AI request/proposal/retry ' +
          'states.',
        inventory,
      },
      null,
      2
    )
  );
}

async function setInspectorWidth(page: Page, width: number) {
  await page.locator(SHELL).evaluate((node, value) => {
    if (node instanceof HTMLElement) node.style.width = `${value}px`;
  }, width);
  await expect
    .poll(async () => Math.round((await page.locator(SHELL).boundingBox())!.width))
    .toBe(width);
}

async function openAllDetails(panel: Locator) {
  for (let index = 0; index < 64; index++) {
    const closed = panel.locator('details:not([open]) > summary:visible').first();
    if (!(await closed.count())) return;
    await closed.click();
  }
  await expect(panel.locator('details:not([open]) > summary:visible')).toHaveCount(0);
}

async function selectAndAudit(
  page: Page,
  info: TestInfo,
  inventory: unknown[],
  name: string,
  target: Locator,
  capture = true,
  expectedTitle?: string
) {
  await expect(target).toBeVisible();
  await target.click();
  if (name.startsWith('track-') || name === 'scene')
    await expect(target).toHaveAttribute('aria-pressed', 'true');
  if (expectedTitle)
    await expect(
      page.locator('[data-ui="video-editor.workspace.sidebar-header-title-row"]')
    ).toHaveText(expectedTitle);
  await auditSelection(page, info, inventory, name, capture);
}

async function selectAuditClip(page: Page, clip: VideoProjectClip, locale: 'en' | 'ru') {
  await page
    .getByRole('button', {
      name: translate('videoEditor.sidebar.sceneProperties', locale),
      exact: true,
    })
    .click();
  await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
  const target = page.locator(`[data-project-timeline-clip="${clip.id}"]`);
  await expect(target).toBeVisible();
  // Native toggle selection avoids starting a move/trim gesture on a narrow fitted clip.
  await target.click({ modifiers: ['Control'] });
  await expect(target).toHaveClass(/video-editor-timeline-item-selected/u);
  await expect(
    page.locator('[data-ui="video-editor.workspace.sidebar-header-title-row"]')
  ).toHaveText(clip.name);
  await page.locator('[data-ui="video-editor.timeline.toolbar.fit-selection"]').click();
  await expect(target).toHaveClass(/video-editor-timeline-item-selected/u);
}

async function auditSelection(
  page: Page,
  info: TestInfo,
  inventory: unknown[],
  name: string,
  capture = true
) {
  const panel = page.locator(INSPECTOR);
  await expect(panel).toBeVisible();
  const header = page.locator('[data-ui="video-editor.workspace.sidebar-header-title-row"]');
  const selectedTitle = await header.innerText();
  if (await panel.locator('[data-presentation="all"]').count()) await page.locator(TOGGLE).click();
  const rail = panel.locator('[data-ui="video-editor.inspector.categories"] > nav');
  const categories = await rail.getByRole('button').count();
  for (let index = 0; index < categories; index++) {
    const button = rail.getByRole('button').nth(index);
    const category = (await button.getAttribute('aria-label')) ?? (await button.innerText());
    await button.click();
    await expect(header).toHaveText(selectedTitle);
    await openAllDetails(panel);
    await checkInspectorLabels(panel);
    await checkInspectorParameterRows(panel);
    inventory.push({
      selection: name,
      presentation: 'category',
      category,
      fields: await collectParameters(panel),
    });
    if (capture && index === 0) {
      await captureScrollPositions(page, panel, info, `${name}-category-${index}`);
    } else if (capture) {
      await panel
        .locator('[data-ui="video-editor.inspector.categories"] > div')
        .evaluate((node) => {
          node.scrollTop = 0;
        });
      await page.screenshot({
        path: info.outputPath(`${name}-category-${index}.png`),
        fullPage: false,
      });
    }
  }
  if (categories) await page.locator(TOGGLE).click();
  await openAllDetails(panel);
  await checkInspectorParameterRows(panel);
  inventory.push({ selection: name, presentation: 'all', fields: await collectParameters(panel) });
  if (capture) await captureScrollPositions(page, panel, info, `${name}-all`);
  await checkAndCaptureAllLayout(page, panel, info, name);
}

async function collectParameters(panel: Locator) {
  return panel.evaluate((root) => {
    const geometry = (node: Element) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const text = (node: Element | null) => node?.textContent?.trim().replace(/\s+/gu, ' ') ?? '';
    const name = (node: Element) => {
      const ids = node.getAttribute('aria-labelledby')?.split(/\s+/u) ?? [];
      const associated = ids
        .map((id) => text(document.getElementById(id)))
        .join(' ')
        .trim();
      const labels =
        node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
          ? [...(node.labels ?? [])].map(text).join(' ')
          : '';
      return (
        node.getAttribute('aria-label') ||
        associated ||
        labels ||
        node.getAttribute('title') ||
        text(node)
      );
    };
    const visible = (node: Element) =>
      node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
    return {
      bounds: geometry(root),
      sections: [...root.querySelectorAll('[data-section]')].filter(visible).map((node) => ({
        id: node.getAttribute('data-section'),
        heading: text(
          node.querySelector('summary, [data-ui="shared.categorized-inspector.section-heading"]')
        ),
        geometry: geometry(node),
      })),
      controls: [
        ...root.querySelectorAll(
          'input, textarea, select, button, summary, [role="switch"], [role="slider"]'
        ),
      ]
        .filter(visible)
        .map((node) => ({
          name: name(node),
          section: node.closest('[data-section]')?.getAttribute('data-section') ?? null,
          disclosure: text(node.closest('details')?.querySelector(':scope > summary') ?? null),
          controlType:
            node.getAttribute('role') ?? node.getAttribute('type') ?? node.tagName.toLowerCase(),
          owner: node.closest('[data-ui]')?.getAttribute('data-ui'),
          disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true',
          value:
            node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
              ? node.value
              : null,
          geometry: geometry(node),
          font: getComputedStyle(node).font,
        })),
    };
  });
}

async function captureScrollPositions(page: Page, panel: Locator, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const categorized = panel.locator('[data-ui="video-editor.inspector.categories"] > div');
  const settings = (await categorized.count())
    ? categorized
    : panel.locator('[data-ui="video-editor.inspector.body"]');
  await settings.evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.screenshot({ path: info.outputPath(`${name}-top.png`), fullPage: false });
  const rail = panel.locator('[data-ui="video-editor.inspector.categories"] > nav');
  const railTop = (await rail.count()) ? (await rail.boundingBox())?.y : undefined;
  const headerTop = (await page.locator(TOGGLE).boundingBox())?.y;
  const overflowing = await settings.evaluate((node) => node.scrollHeight > node.clientHeight);
  if (!overflowing) return;
  await expect(settings).toHaveCSS('overflow-y', 'auto');
  const bounds = (await settings.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => settings.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  if (railTop !== undefined) expect((await rail.boundingBox())?.y).toBe(railTop);
  expect((await page.locator(TOGGLE).boundingBox())?.y).toBe(headerTop);
  await page.screenshot({ path: info.outputPath(`${name}-bottom.png`), fullPage: false });
}

async function auditUtilitySelections(
  page: Page,
  info: TestInfo,
  inventory: unknown[],
  fixture: ReturnType<typeof createInspectorAuditFixture>,
  locale: 'en' | 'ru'
) {
  const targets = [
    [
      'motion-lane',
      '[data-ui="video-editor.timeline.motion-lane-select"]',
      'videoEditor.timeline.motionLane',
    ],
    [
      'motion-region',
      `[data-timeline-effect-segment="${fixture.motion.id}"]`,
      'videoEditor.timeline.motionLane',
    ],
    [
      'motion-connection',
      `[data-framing-destination="${fixture.connected.id}"]`,
      'videoEditor.timeline.framingConnection',
    ],
    [
      'history-lane',
      '[data-ui="video-editor.timeline.history-lane"]',
      'videoEditor.timeline.telemetryLane',
    ],
    [
      'cursor-segment',
      '[data-ui="video-editor.timeline.history-cursor-row"] [data-timeline-effect-segment]',
      'videoEditor.timeline.cursorLane',
    ],
    ['action-click', '[data-action-id="audit-click"]', 'videoEditor.timeline.actionsLane'],
    ['action-key', '[data-action-id="audit-key"]', 'videoEditor.timeline.actionsLane'],
    [
      'history-span',
      '[data-ui="video-editor.timeline.history-span"][data-history-signal-id="same"]',
      'videoEditor.timeline.historyTyping',
    ],
    [
      'transition-junction',
      '[data-ui="timeline.track-transition-zone"]',
      'videoEditor.timeline.transitionLane',
    ],
  ] as const;
  for (const [name, selector, heading] of targets) {
    await selectAuditClip(
      page,
      name === 'transition-junction' ? fixture.image.first : fixture.text,
      locale
    );
    const target = page.locator(selector).first();
    await target.click();
    await expect(
      page.locator('[data-ui="video-editor.workspace.sidebar-header-title-row"]')
    ).toHaveText(translate(heading, locale));
    await auditSelection(page, info, inventory, name);
  }
  await selectAuditClip(page, fixture.text, locale);
  await page
    .locator(`[data-project-timeline-clip="${fixture.shapes[0]!.id}"]`)
    .click({ modifiers: ['Control'] });
  await expect(
    page.locator('[data-ui="video-editor.workspace.sidebar-header-title-row"]')
  ).toHaveText(translate('videoEditor.sidebar.clipGroup', locale));
  await auditSelection(page, info, inventory, 'clip-group');
  // Object selection is reached through the scene's native object collection.
  await page
    .getByRole('button', {
      name: translate('videoEditor.sidebar.sceneProperties', locale),
      exact: true,
    })
    .click();
  if (!(await page.locator(INSPECTOR).locator('[data-presentation="all"]').count()))
    await page.locator(TOGGLE).click();
  await openAllDetails(page.locator(INSPECTOR));
  await selectAndAudit(
    page,
    info,
    inventory,
    'object-track',
    page.locator('[data-ui="video-editor.object-track.select"]').first(),
    true,
    translate('videoEditor.sidebar.objectTracksTitle', locale)
  );
  await auditObjectDeleteUndo(page, info, locale);
}

async function auditObjectDeleteUndo(page: Page, info: TestInfo, locale: 'en' | 'ru') {
  const panel = page.locator(INSPECTOR);
  const remove = panel.getByRole('button', {
    name: translate('videoEditor.sidebar.objectTrackDeleteLabel', locale),
    exact: true,
  });
  await expect(remove).toHaveCount(1);
  await remove.scrollIntoViewIfNeeded();
  await expect(remove).toBeEnabled();
  await expect(remove).toBeInViewport();
  await remove.click();
  await page
    .getByRole('button', {
      name: translate('videoEditor.sidebar.sceneProperties', locale),
      exact: true,
    })
    .click();
  if (!(await panel.locator('[data-presentation="all"]').count()))
    await page.locator(TOGGLE).click();
  await openAllDetails(panel);
  const collection = panel.locator('[data-section="object-tracks"]');
  await expect(collection).toHaveCount(0);
  await expect(panel.locator('[data-ui="video-editor.object-track.select"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('object-track-deleted.png'), fullPage: false });
  await page.keyboard.press('Control+z');
  await expect(
    page.locator('[data-ui="video-editor.workspace.sidebar-header-title-row"]')
  ).toHaveText(translate('videoEditor.sidebar.objectTracksTitle', locale));
  await page
    .getByRole('button', {
      name: translate('videoEditor.sidebar.sceneProperties', locale),
      exact: true,
    })
    .click();
  if (!(await panel.locator('[data-presentation="all"]').count()))
    await page.locator(TOGGLE).click();
  await openAllDetails(panel);
  await expect(collection).toBeVisible();
  const select = collection.locator('[data-ui="video-editor.object-track.select"]');
  await expect(select).toHaveCount(1);
  await expect(select).toBeEnabled();
  await select.click();
  await expect(
    page.locator('[data-ui="video-editor.workspace.sidebar-header-title-row"]')
  ).toHaveText(translate('videoEditor.sidebar.objectTracksTitle', locale));
  await expect(
    panel.locator('[data-ui="video-editor.object-track.confidence-segment"]')
  ).toHaveCount(3);
  await page.screenshot({
    path: info.outputPath('object-track-restored-after-undo.png'),
    fullPage: false,
  });
}

async function auditTextEditing(
  page: Page,
  info: TestInfo,
  clip: VideoProjectClip,
  original: string,
  label: string,
  locale: 'en' | 'ru'
) {
  await selectAuditClip(page, clip, locale);
  const panel = page.locator(INSPECTOR);
  if (!(await panel.locator('[data-presentation="all"]').count()))
    await page.locator(TOGGLE).click();
  await openAllDetails(panel);
  const field = panel.getByRole('textbox', { name: label, exact: true });
  await field.fill('Inspector keyboard edit / Правка клавиатурой');
  await field.press('Tab');
  await page.keyboard.press('Control+z');
  await expect(field).toHaveValue(original);
  await field.scrollIntoViewIfNeeded();
  await checkInspectorPaintedFont(page, field, 'input');
  const visibleLabel = panel
    .locator('[data-ui="shared.ui.compact-inspector.textarea-field"] > span')
    .first();
  await checkInspectorPaintedFont(page, visibleLabel, 'label');
  await page.screenshot({ path: info.outputPath('keyboard-edit-undone.png'), fullPage: false });
}

async function auditTextZoom(page: Page, info: TestInfo, name: string) {
  const panel = page.locator(INSPECTOR);
  const styles = await panel.evaluateHandle((root) => {
    const nodes = [
      ...root.querySelectorAll<HTMLElement>('span, input, textarea, button, summary, label'),
    ];
    const original = nodes.map((node) => ({
      node,
      style: node.getAttribute('style'),
      size: parseFloat(getComputedStyle(node).fontSize),
    }));
    for (const item of original) item.node.style.fontSize = `${item.size * 1.25}px`;
    return original;
  });
  try {
    await expect
      .poll(() => panel.evaluate((root) => root.scrollWidth - root.clientWidth))
      .toBeLessThanOrEqual(1);
    await checkInspectorParameterRows(panel);
    await page.screenshot({ path: info.outputPath(`${name}-text-zoom-125.png`), fullPage: false });
  } finally {
    await styles.evaluate((original) => {
      for (const { node, style } of original) {
        if (style === null) node.removeAttribute('style');
        else node.setAttribute('style', style);
      }
    });
    await styles.dispose();
  }
}

async function auditNarrowChoices(page: Page, info: TestInfo, inventory: unknown[]) {
  const panel = page.locator(INSPECTOR);
  await page.locator(TOGGLE).click();
  const rail = panel.locator('[data-ui="video-editor.inspector.categories"] > nav');
  const first = rail.getByRole('button').first();
  await first.focus();
  await first.press('End');
  await expect(rail.getByRole('button').last()).toBeFocused();
  await rail.getByRole('button').last().press('Home');
  await expect(first).toBeFocused();
  await page.locator(TOGGLE).click();
  await openAllDetails(panel);
  for (const width of [359, 360, 361, 320, 280]) {
    await setInspectorWidth(page, width);
    await checkInspectorLabels(panel);
    await expect
      .poll(() => panel.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeLessThanOrEqual(1);
    const choices = await panel
      .locator('[data-ui="shared.ui.compact-inspector.segmented-row"]')
      .evaluateAll((rows) =>
        rows
          .filter((node) => node.getClientRects().length)
          .map((row) => ({
            label: row.textContent,
            width: row.getBoundingClientRect().width,
            options: [...row.querySelectorAll('button')].map((button) => {
              const css = getComputedStyle(button);
              const context = document.createElement('canvas').getContext('2d')!;
              context.font = css.font;
              return {
                label: button.textContent,
                width: button.getBoundingClientRect().width,
                textWidth: context.measureText(button.textContent ?? '').width,
                padding: parseFloat(css.paddingLeft) + parseFloat(css.paddingRight),
                height: button.getBoundingClientRect().height,
              };
            }),
          }))
      );
    for (const choice of choices)
      for (const option of choice.options) {
        expect(option.textWidth + option.padding, option.label ?? '').toBeLessThanOrEqual(
          option.width + 1
        );
        expect(option.height).toBe(32);
      }
    inventory.push({ width, choices });
    await page.screenshot({ path: info.outputPath(`choice-fit-${width}.png`), fullPage: false });
  }
  await setInspectorWidth(page, 320);
  const catalog = panel.locator('[data-ui="shared.ui.compact-select"] > button').first();
  await catalog.click();
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible();
  await checkInspectorPaintedFont(page, option, 'menu');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
}

type AuditLabel = (key: Parameters<typeof translate>[0]) => string;

async function auditSceneText(page: Page, info: TestInfo, inventory: unknown[], label: AuditLabel) {
  await page
    .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
    .click();
  const panel = page.locator(INSPECTOR);
  if (!(await panel.locator('[data-presentation="all"]').count()))
    await page.locator(TOGGLE).click();
  await openAllDetails(panel);
  await panel
    .locator('[data-ui="video-editor.text.panel"]')
    .getByRole('group', { name: label('gallery.videoReview.textView'), exact: true })
    .getByRole('button', { name: label('gallery.videoReview.textViewCards'), exact: true })
    .click();
  const phrase = panel.locator('[data-text-id="audit-phrase"] > button').first();
  await expect(phrase).toHaveAttribute('title', /deliberately long phrase/u);
  await phrase.click();
  await openAllDetails(panel);
  inventory.push({
    selection: 'scene-text-expanded-phrase',
    fields: await collectParameters(panel),
  });
  await page.screenshot({ path: info.outputPath('scene-text-phrase.png'), fullPage: false });
  const rewrite = panel.getByRole('button', {
    name: label('gallery.videoReview.textRewriteAll'),
    exact: true,
  });
  await rewrite.click();
  await openAllDetails(panel);
  inventory.push({ selection: 'text-rewrite-settings', fields: await collectParameters(panel) });
  await page.screenshot({ path: info.outputPath('text-rewrite-settings.png'), fullPage: false });
}

async function auditExport(page: Page, info: TestInfo, inventory: unknown[], label: AuditLabel) {
  await page.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]').click();
  await page
    .getByRole('button', { name: label('videoEditor.app.exportButton'), exact: true })
    .click();
  const panel = page.locator('[data-ui="video-editor.export.inspector"]');
  await expect(panel).toBeVisible();
  await openAllDetails(panel);
  inventory.push({ selection: 'export-expanded', fields: await collectParameters(panel) });
  const submit = panel.getByRole('button', {
    name: label('videoEditor.exportDialog.submit'),
    exact: true,
  });
  await expect(submit).toBeInViewport();
  const fields = panel.locator(':scope > div').first();
  await fields.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(submit).toBeInViewport();
  await page.screenshot({
    path: info.outputPath('export-subtitles-and-footer.png'),
    fullPage: false,
  });
}

async function auditImportedEffects(
  page: Page,
  info: TestInfo,
  inventory: unknown[],
  fixture: ReturnType<typeof createInspectorAuditFixture>,
  locale: 'en' | 'ru'
) {
  const cases = [
    {
      id: 'neutral-standalone',
      path: EFFECT_V1_STANDALONE_FIXTURE,
      action: 'videoEditor.effectsLibrary.applyToScene',
      target: '[data-ui="video-editor.viewer.scene"]',
    },
    {
      id: 'demo-target-overlay',
      path: EFFECT_V1_TARGET_FIXTURE,
      action: 'videoEditor.effectsLibrary.applyToClip',
      target: `[data-project-timeline-clip="${fixture.image.first.id}"]`,
    },
    {
      id: 'neutral-transition',
      path: EFFECT_V1_TRANSITION_FIXTURE,
      action: 'videoEditor.effectsLibrary.applyToTransition',
      target: '[data-ui="timeline.track-transition-zone"]',
    },
  ] as const;
  for (const item of cases) {
    if (item.id === 'demo-target-overlay') await selectAuditClip(page, fixture.image.first, locale);
    else {
      await selectAuditClip(
        page,
        item.id === 'neutral-transition' ? fixture.image.first : fixture.text,
        locale
      );
      const target =
        item.id === 'neutral-standalone'
          ? page.getByRole('button', {
              name: translate('videoEditor.sidebar.sceneProperties', locale),
              exact: true,
            })
          : page.locator(item.target).first();
      await target.click();
    }
    await importEffectFile(page, { documentId: item.id, fixturePath: item.path, locale });
    const card = page.locator(`[data-effect-document="${item.id}"]`);
    await card.hover();
    const before = await countPersistedEffectInstances(page);
    const apply = card.getByRole('button', {
      name: translate(
        item.id === 'neutral-standalone' ? 'videoEditor.app.materialsAppend' : item.action,
        locale
      ),
      exact: true,
    });
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect
      .poll(
        async () => ({
          persistedInstances: await countPersistedEffectInstances(page),
          operationErrors: await page
            .locator('[data-ui="video-editor.effects-library.dock"]')
            .getByRole('alert')
            .allTextContents(),
          saveStatus: await page
            .locator('[data-ui="autosave-control"] button')
            .first()
            .getAttribute('title'),
        }),
        { message: `${item.id} must commit before closing the material library` }
      )
      .toMatchObject({ persistedInstances: before + 1, operationErrors: [] });
    await page.locator('[data-ui="video-editor.materials.close"]').click();
    const panel = page.locator(INSPECTOR);
    if (!(await panel.locator('[data-presentation="all"]').count()))
      await page.locator(TOGGLE).click();
    await openAllDetails(panel);
    await expect(panel.locator('[data-effect-instance]').first()).toBeVisible();
    await auditSelection(page, info, inventory, `imported-effect-${item.id}`);
  }
}
