import { readFile } from 'node:fs/promises';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { createGlTransitionSelection } from '../../../../apps/extension/src/features/video/project/transition/gl-catalog';
import { basename } from 'node:path';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createTextClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
// prettier-ignore
import {
  createVideoProjectClipLogicalLaneId,
} from '../../../../apps/extension/src/features/video/project/timeline/logical-lanes';
// prettier-ignore
import {
  parseVideoProjectTransition,
} from '../../../../apps/extension/src/features/video/project/transition/contract';
import {
  VideoTrackKind,
  VideoTransitionEasing,
  type VideoProject,
  type VideoProjectClip,
} from '../../../../apps/extension/src/features/video/project/types';
import {
  applyHarnessBootstrap,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

export const LOTTIE_ANNOTATION_FIXTURE = fileURLToPath(
  new URL('../fixtures/lottie/neutral.sniptale-animation.json', import.meta.url)
);
/** Isolate shipped Lottie bytes under a test identity without changing embedded resources. */
export async function readAnimationFixtureSource(fixturePath: string, documentId: string) {
  const parsed = parseAnimationTemplateSource(await readFile(fixturePath, 'utf8'));
  if (!parsed.template) throw new Error('Invalid Lottie fixture');
  const template = parsed.template;
  template.id = documentId;
  template.label = { en: `E2E ${documentId}`, ru: `E2E ${documentId}` };
  const source = JSON.stringify(template);
  if (!parseAnimationTemplateSource(source).ok) throw new Error('Invalid authored Lottie fixture');
  return source;
}

const VISUAL_INPUT_FIXTURE = fileURLToPath(
  new URL(
    '../extension-critical-media.spec.ts-snapshots/editor-browser-frame-exact-linux.png',
    import.meta.url
  )
);
const VIDEO_INPUT_FIXTURE = fileURLToPath(
  new URL('../fixtures/cache-source.webm', import.meta.url)
);

export async function openEffectVideoEditorHarness(
  page: Page,
  hostOrigin: string,
  project?: VideoProject
): Promise<void> {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    ...(project ? { videoProjects: [project] } : {}),
  });
  const projectQuery = project ? `?project=${encodeURIComponent(project.id)}` : '';
  await page.goto(`${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}${projectQuery}`, {
    waitUntil: 'domcontentloaded',
  });
  if (!project) {
    await page
      .getByRole('button', { name: translate('videoEditor.app.newProjectAction'), exact: true })
      .click();
  }
}

export function createTransitionE2eProject(): VideoProject {
  const project = createEmptyVideoProject('GL transition E2E', 3840, 2160);
  const track = createVideoProjectTrack('Effects', 0, VideoTrackKind.PRIMARY);
  project.tracks.push(track);
  const laneId = createVideoProjectClipLogicalLaneId(0);
  const leading = {
    ...createTextClip(track.id, project.width, project.height, 0),
    duration: 0.75,
    id: 'e2e-transition-leading',
    timelineLaneId: laneId,
  };
  const trailing = {
    ...createTextClip(track.id, project.width, project.height, 0.1),
    duration: 1.9,
    id: 'e2e-transition-trailing',
    timelineLaneId: laneId,
  };
  return {
    ...project,
    clips: [leading, trailing],
    duration: 2,
    transitions: [
      parseVideoProjectTransition({
        duration: 1,
        easing: VideoTransitionEasing.EASE_IN_OUT,
        id: 'e2e-transition-junction',
        kind: 'gl' as const,
        selection: createGlTransitionSelection('Fade')!,
        leadingClipId: leading.id,
        trailingClipId: trailing.id,
      })!,
    ],
  };
}

export async function importAndApplyEffect(
  page: Page,
  args: { documentId: string; fixturePath: string }
): Promise<void> {
  await importEffectFile(page, args);

  const documentLabel = page.locator(`[data-effect-document="${args.documentId}"]`);
  await documentLabel.hover();
  const applyKey = 'videoEditor.effectsLibrary.applyToScene';
  const addButton = documentLabel.getByRole('button', { name: translate(applyKey), exact: true });
  await expect(addButton).toBeEnabled();
  await addButton.click();
  await page.locator('[data-ui="video-editor.materials.close"]').click();
}

export async function importEffectFile(
  page: Page,
  args: { documentId: string; fixturePath: string; locale?: 'ru' | 'en' }
): Promise<void> {
  const dock = page.locator('[data-ui="video-editor.effects-library.dock"]');
  if (!(await dock.isVisible())) {
    const openMaterials = page.locator('[data-ui="video-editor.viewer.open-materials"]');
    if (await openMaterials.isVisible()) await openMaterials.click();
    await page.locator('[data-ui="video-editor.library-tab.effects"]').click();
  }
  await page.locator('[data-ui="video-editor.library-tab.annotations"]').click();
  const importControl = dock.getByRole('button', {
    name: translate('videoEditor.effectsLibrary.importPack', args.locale ?? 'ru'),
    exact: true,
  });
  await expect(importControl).toBeEnabled();
  const chooserPromise = page.waitForEvent('filechooser');
  await importControl.click();
  await (
    await chooserPromise
  ).setFiles(
    args.fixturePath.endsWith('.sniptale-animation.json')
      ? {
          name: `${args.documentId}.sniptale-animation.json`,
          mimeType: 'application/json',
          buffer: Buffer.from(await readAnimationFixtureSource(args.fixturePath, args.documentId)),
        }
      : args.fixturePath
  );
  await page.locator('[data-ui="video-editor.library-tab.annotations"]').click();
  const documentLabel = page.locator(`[data-effect-document="${args.documentId}"]`);
  await expect(documentLabel).toBeVisible();
}

async function openCurrentLibrary(page: Page, section: 'effects' | 'transitions') {
  const tab = page.locator(`[data-ui="video-editor.library-tab.${section}"]`);
  if (!(await tab.isVisible()))
    await page
      .locator(
        '[data-ui="video-editor.viewer.open-materials"], [data-ui="video-editor.viewer.open-effects"]'
      )
      .first()
      .click();
  await tab.click();
}
export async function applyBuiltinSourceFilter(page: Page, locale: 'en' | 'ru' = 'ru') {
  await openCurrentLibrary(page, 'effects');
  const fields = page.locator('[data-ui="video-editor.effects-library.source-filters"]');
  await expect(fields).toBeVisible();
  await fields
    .getByRole('button', {
      name: translate('videoEditor.sidebar.sourceFiltersAddBlur', locale),
      exact: true,
    })
    .first()
    .click();
  await page.locator('[data-ui="video-editor.materials.close"]').click();
}
export async function chooseGlTransition(page: Page, name: 'Fade' | 'CrossZoom' = 'CrossZoom') {
  await openCurrentLibrary(page, 'transitions');
  const fields = page.locator('[data-ui="video-editor.effects-library.gl"]');
  await fields.locator('button[aria-haspopup="listbox"]').first().click();
  await page.getByRole('option', { name, exact: true }).click();
  await page.locator('[data-ui="video-editor.materials.close"]').click();
}

export async function importVisualInput(page: Page): Promise<void> {
  const visualInput = page.locator('input[type="file"][accept*="image/png"]').first();
  await visualInput.setInputFiles(VISUAL_INPUT_FIXTURE);
  await appendImportedMaterial(page, VISUAL_INPUT_FIXTURE);
  await expect(page.locator('[data-playback-counter="true"]')).not.toContainText('/ 0:00.0');
}

export async function importVideoInput(page: Page): Promise<void> {
  const videoInput = page.locator('input[type="file"][accept*="video"]').first();
  await videoInput.setInputFiles(VIDEO_INPUT_FIXTURE);
  await appendImportedMaterial(page, VIDEO_INPUT_FIXTURE);
  await expect(page.locator('[data-playback-counter="true"]')).not.toContainText('/ 0:00.0');
}

export async function countResponsiveAnimationFrames(
  page: Page,
  durationMs: number
): Promise<number> {
  return page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        const startedAt = performance.now();
        let frames = 0;
        const tick = (now: number) => {
          frames += 1;
          if (now - startedAt >= duration) {
            resolve(frames);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    durationMs
  );
}

export async function readPreviewCanvasSignature(page: Page): Promise<string> {
  return page.locator('[data-preview-stage-canvas]').evaluate((canvas: HTMLCanvasElement) => {
    const sample = document.createElement('canvas');
    sample.width = 32;
    sample.height = 18;
    const context = sample.getContext('2d');
    if (!context) throw new Error('Preview sample canvas context unavailable');
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    return sample.toDataURL('image/png');
  });
}

export async function countPersistedEffectInstances(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('sniptale-db');
        open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
        open.onsuccess = () => {
          const database = open.result;
          const request = database
            .transaction('video_projects', 'readonly')
            .objectStore('video_projects')
            .getAll();
          request.onerror = () => reject(request.error ?? new Error('Project read failed'));
          request.onsuccess = () => {
            const count = request.result.reduce((total, entry: unknown) => {
              if (typeof entry !== 'object' || entry === null || !('project' in entry))
                return total;
              const project = entry.project;
              if (
                typeof project !== 'object' ||
                project === null ||
                !('effectInstances' in project) ||
                !Array.isArray(project.effectInstances)
              ) {
                return total;
              }
              return total + project.effectInstances.length;
            }, 0);
            database.close();
            resolve(count);
          };
        };
      })
  );
}

async function appendImportedMaterial(page: Page, fixturePath: string): Promise<void> {
  await page
    .locator('[data-ui="video-editor.materials"]')
    .getByRole('button', { name: basename(fixturePath), exact: true })
    .click();
  await page
    .locator('[data-ui="video-editor.source-viewer"]')
    .getByTitle(/^Append to timeline$|^Добавить в конец$/)
    .click();
}

export async function overlapTimelineClips(
  page: Page,
  args: {
    leading: VideoProjectClip;
    trailing: VideoProjectClip;
    duration: number;
  }
) {
  await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
  const leading = page.locator(`[data-project-timeline-clip="${args.leading.id}"]`);
  const trailing = page.locator(`[data-project-timeline-clip="${args.trailing.id}"]`);
  await trailing.scrollIntoViewIfNeeded();
  await trailing.focus();
  await trailing.press('v');
  const before = await leading.boundingBox(),
    moving = await trailing.boundingBox();
  if (!before || !moving || args.leading.duration <= 0)
    throw new Error('Missing join drag geometry.');
  const shift =
    ((args.leading.startTime + args.leading.duration - args.duration - args.trailing.startTime) *
      before.width) /
    args.leading.duration;
  const x = moving.x + moving.width / 2,
    y = moving.y + moving.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + shift, y, { steps: 12 });
  await page.mouse.up();
}
