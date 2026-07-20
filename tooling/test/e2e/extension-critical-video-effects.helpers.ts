import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { createEmptyVideoProject } from '../../../apps/extension/src/features/video/project/factories/creation';
import { createTextClip } from '../../../apps/extension/src/features/video/project/factories/overlay-clip';
// prettier-ignore
import {
  createVideoProjectClipLogicalLaneId,
} from '../../../apps/extension/src/features/video/project/timeline/logical-lanes';
// prettier-ignore
import {
  normalizeVideoProjectTransition,
} from '../../../apps/extension/src/features/video/project/transition/template';
import {
  VideoTrackKind,
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
} from '../../../apps/extension/src/features/video/project/types';
import {
  applyHarnessBootstrap,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  VIDEO_EDITOR_EFFECT_ADD_LABEL,
  VIDEO_EDITOR_EFFECT_IMPORT_LABEL,
  VIDEO_EDITOR_HARNESS_PATH,
} from './extension-critical.helpers';

export const EFFECT_V1_STANDALONE_FIXTURE = fileURLToPath(
  new URL(
    '../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json',
    import.meta.url
  )
);
export const EFFECT_V1_TARGET_FIXTURE = fileURLToPath(
  new URL('./fixtures/effect-v1/demo-target-overlay.sniptale-effect.json', import.meta.url)
);
export const EFFECT_V1_TRANSITION_FIXTURE = fileURLToPath(
  new URL(
    '../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-transition.sniptale-effect.json',
    import.meta.url
  )
);
const VISUAL_INPUT_FIXTURE = fileURLToPath(
  new URL(
    './extension-critical-media.spec.ts-snapshots/editor-browser-frame-exact-linux.png',
    import.meta.url
  )
);
const VIDEO_INPUT_FIXTURE = fileURLToPath(new URL('./fixtures/cache-source.webm', import.meta.url));

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
}

export function createTransitionE2eProject(): VideoProject {
  const project = createEmptyVideoProject('EffectV1 transition E2E', 3840, 2160);
  const track = project.tracks.find(({ kind }) => kind === VideoTrackKind.OVERLAY);
  if (!track) throw new Error('Overlay track unavailable');
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
      normalizeVideoProjectTransition({
        duration: 1,
        easing: VideoTransitionEasing.EASE_IN_OUT,
        id: 'e2e-transition-junction',
        kind: VideoTransitionKind.CROSSFADE,
        leadingClipId: leading.id,
        trailingClipId: trailing.id,
      }),
    ],
  };
}

export async function importAndApplyEffect(
  page: Page,
  args: { documentId: string; fixturePath: string }
): Promise<void> {
  await importEffectFile(page, args);

  const documentLabel = page.getByText(args.documentId, { exact: true });
  const addButton = documentLabel.locator('..').locator('..').getByRole('button', {
    name: VIDEO_EDITOR_EFFECT_ADD_LABEL,
    exact: true,
  });
  await expect(addButton).toBeEnabled();
  await addButton.click();
}

export async function importEffectFile(
  page: Page,
  args: { documentId: string; fixturePath: string }
): Promise<void> {
  const importControl = page.getByText(VIDEO_EDITOR_EFFECT_IMPORT_LABEL, { exact: true });
  await expect(importControl).toBeVisible();
  await importControl.locator('input[type="file"]').setInputFiles(args.fixturePath);

  const documentLabel = page.getByText(args.documentId, { exact: true });
  await expect(documentLabel).toBeVisible();
}

export async function importVisualInput(page: Page): Promise<void> {
  const visualInput = page.locator('input[type="file"][accept*="image/png"]').first();
  await visualInput.setInputFiles(VISUAL_INPUT_FIXTURE);
  await expect(page.locator('[data-playback-counter="true"]')).not.toContainText('/ 0:00.0');
}

export async function importVideoInput(page: Page): Promise<void> {
  const videoInput = page.locator('input[type="file"][accept*="video"]').first();
  await videoInput.setInputFiles(VIDEO_INPUT_FIXTURE);
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
        const open = indexedDB.open('sniptale-video-db');
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
