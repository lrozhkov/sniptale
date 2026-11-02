import { createGradientPaint } from '@sniptale/foundation/paint';
import type { QuickEditBackgroundSettings } from '../../../../apps/extension/src/features/video/review/advanced/types';
import type { Page } from '@playwright/test';
import { REVIEW_CLICK_DEFAULT } from '../../../../apps/extension/src/features/video/review/advanced/click-animation';
import { REVIEW_KEY_DEFAULT } from '../../../../apps/extension/src/features/video/project/action-feedback/key-animation';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  validateEffectV1Document,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import { initializeReviewAnnotationEffectAnchors } from '../../../../apps/extension/src/features/video/review/annotation-effects/layout';
import type {
  ReviewAnnotationEffectSnapshot,
  ReviewAnnotationEffects,
} from '../../../../apps/extension/src/features/video/review/annotation-effects/types';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import type { QuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/types';
import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';

interface PerformanceScenario {
  id: string;
  decorated?: boolean;
  header?: boolean;
  gradient?: 'linear' | 'radial';
  backgroundBlur?: boolean;
  borders?: number;
  style?: 'solid' | 'dashed';
  moving?: boolean;
  feedback?: boolean;
  motion?: 'clockwise' | 'counterclockwise' | 'pulse' | 'ripple';
  zoom?: boolean;
  masks?: readonly ('dim' | 'blur' | 'magnify')[];
  optical?: boolean;
  annotations?: number;
  operation?: 'playback' | 'drag';
}

/** Add a descriptor to retain a found workload; both video editor adapters consume it. */
export const previewPerformanceScenarios = [
  { id: 'plain' },
  { id: 'advanced' },
  { id: 'spotlight' },
  { id: 'motion-spatial', decorated: true, header: true },
  { id: 'webcam' },
  { id: 'combined', decorated: true, header: true, feedback: true },
  { id: 'background-shadow', decorated: true },
  { id: 'background-shadow-header', decorated: true, header: true },
  { id: 'gradient-shadow', decorated: true, gradient: 'linear' },
  {
    id: 'radial-background-blur-shadow',
    decorated: true,
    gradient: 'radial',
    backgroundBlur: true,
  },
  { id: 'three-solid-borders', borders: 3, style: 'solid' },
  { id: 'three-moving-borders', borders: 3, style: 'dashed', moving: true },
  {
    id: 'zoom-borders-shadow',
    borders: 3,
    style: 'dashed',
    moving: true,
    zoom: true,
    decorated: true,
  },
  { id: 'two-dim-masks', masks: ['dim', 'dim'] },
  { id: 'two-blur-masks', masks: ['blur', 'blur'] },
  { id: 'mixed-masks-lens', masks: ['dim', 'blur', 'magnify'], decorated: true },
  { id: 'optical-lens-border', masks: ['magnify'], optical: true, borders: 1, moving: true },
  { id: 'annotation', annotations: 1 },
  { id: 'annotation-border', annotations: 1, borders: 1, moving: true },
  { id: 'two-annotations-border', annotations: 2, borders: 1, moving: true, decorated: true },
  { id: 'three-annotations-zoom', annotations: 3, zoom: true },
  { id: 'keys-clicks', feedback: true },
  {
    id: 'zoom-borders-keys-clicks',
    borders: 3,
    moving: true,
    zoom: true,
    feedback: true,
    decorated: true,
  },
  {
    id: 'annotations-keys-clicks-shadow',
    annotations: 2,
    borders: 1,
    feedback: true,
    decorated: true,
  },
  { id: 'pulse-borders', borders: 3, moving: true, motion: 'pulse' },
  { id: 'ripple-borders', borders: 3, moving: true, motion: 'ripple' },
  { id: 'annotation-drag', annotations: 1, operation: 'drag' },
  { id: 'annotation-border-drag', annotations: 1, borders: 1, operation: 'drag' },
  { id: 'border-drag', borders: 1, operation: 'drag' },
  { id: 'lens-drag', masks: ['magnify'], optical: true, operation: 'drag' },
] as const satisfies readonly PerformanceScenario[];
export type Recipe = (typeof previewPerformanceScenarios)[number]['id'];
export const recipes = previewPerformanceScenarios.map((scenario) => scenario.id);
export function performanceScenario(id: Recipe): PerformanceScenario {
  const scenario = previewPerformanceScenarios.find((entry) => entry.id === id);
  if (!scenario) throw new Error(`Unknown performance scenario: ${id}`);
  return scenario;
}

export function sceneRegions(recipe: Recipe): QuickEditZoomRegion[] {
  const regions: QuickEditZoomRegion[] = [];
  if (recipe === 'spotlight' || recipe === 'combined')
    regions.push({
      ...createQuickEditZoomRegion({
        id: 'performance-spotlight',
        at: 0,
        duration: 40,
        endMax: 40,
      }),
      spotlight: {
        ...createQuickEditSpotlight(),
        effect: 'blur',
        blur: 24,
        area: { x: 0.15, y: 0.2, width: 0.4, height: 0.4 },
      },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
    });
  if (recipe === 'motion-spatial' || recipe === 'combined') {
    // Consecutive transition spans exercise motion across the entire timed window, not only a startup animation.
    for (let index = 0; index < 10; index++)
      regions.push({
        ...createQuickEditZoomRegion({
          id: `performance-motion-${index}`,
          at: index * 4,
          duration: 4,
          endMax: 40,
        }),
        transform: { scale: 1.4, centerX: index % 2 ? 0.6 : 0.4, centerY: 0.5 },
        perspective: {
          enabled: true,
          rotateX: 20,
          rotateY: index % 2 ? 35 : -35,
          rotateZ: 8,
          strength: 0.7,
        },
        depthOfField: {
          enabled: true,
          mode: 'area',
          x: 0.5,
          y: 0.5,
          width: 0.2,
          softness: 0.25,
          strength: 0.6,
        },
        motionBlur: {
          enter: { enabled: true, strength: 0.5 },
          exit: { enabled: true, strength: 0.5 },
        },
        enter: { type: 'ease-in-out', duration: 2 },
        exit: { type: 'ease-in-out', duration: 2 },
      });
  }
  const scenario = performanceScenario(recipe);
  for (let index = 0; index < (scenario.borders ?? 0); index++)
    regions.push({
      ...createQuickEditZoomRegion({ id: `border-${index}`, at: 0, duration: 40, endMax: 40 }),
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      border: {
        ...createQuickEditBorder(),
        style: scenario.style ?? 'dashed',
        loop: scenario.moving ?? false,
        motion: scenario.motion ?? 'clockwise',
        segmentPercent: scenario.moving ? 35 : 100,
        area: { x: 0.1 + index * 0.12, y: 0.1 + index * 0.12, width: 0.45, height: 0.45 },
      },
    });
  for (const [index, effect] of (scenario.masks ?? []).entries())
    regions.push({
      ...createQuickEditZoomRegion({ id: `mask-${index}`, at: 0, duration: 40, endMax: 40 }),
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      spotlight: {
        ...createQuickEditSpotlight(),
        effect,
        blur: 24,
        lensOptics: scenario.optical ? 'optical' : 'flat',
        area: { x: 0.12 + index * 0.2, y: 0.18 + index * 0.1, width: 0.35, height: 0.4 },
      },
    });
  if (scenario.zoom)
    regions.push({
      ...createQuickEditZoomRegion({ id: 'zoom', at: 0, duration: 40, endMax: 40 }),
      transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
    });
  return regions;
}

export async function performanceAnnotations(
  recipe: Recipe,
  bounds: { width: number; height: number }
) {
  const count = performanceScenario(recipe).annotations ?? 0;
  if (!count) return null;
  const source = await readFile(
    'apps/extension/public/video-effects/effects/annotations/sniptale-title/effect.sniptale-effect.json',
    'utf8'
  );
  const raw: unknown = JSON.parse(source);
  const parsed = validateEffectV1Document(raw);
  if (!parsed.ok || !parsed.document?.objectLayout)
    throw new Error('Invalid builtin annotation performance fixture');
  const document = parsed.document,
    layout = parsed.document.objectLayout;
  const sha256 = createHash('sha256').update(source).digest('hex');
  const snapshot: ReviewAnnotationEffectSnapshot = {
    id: `effect:${sha256}`,
    sha256,
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
    documentId: document.id,
    source,
    retainedByteLength: Buffer.byteLength(source),
    assets: [],
  };
  const controls = Object.fromEntries(
    document.controls.map((control) => [control.id, resolveEffectV1ControlDefault(control, 'en')])
  );
  const lane: ReviewAnnotationEffects = {
    enabled: true,
    instances: Array.from({ length: count }, (_, index) => {
      const transform = {
        x: 0.12,
        y: 0.12 + index * 0.18,
        width: layout.width / bounds.width,
        height: layout.height / bounds.height,
        rotation: 0,
      };
      const anchors = initializeReviewAnnotationEffectAnchors(
        document,
        transform,
        controls,
        bounds
      );
      return {
        id: `performance-annotation-${index}`,
        snapshotId: snapshot.id,
        enabled: true,
        start: 0,
        end: 40,
        attachment: 'content',
        order: index,
        transform,
        controls: Object.fromEntries(
          Object.entries(controls).filter(
            ([id]) =>
              !layout.handles?.some((handle) => handle.xControl === id || handle.yControl === id)
          )
        ),
        ...(anchors ? { anchors } : {}),
      };
    }),
  };
  return { snapshot, lane };
}

export function performanceFeedback(recipe: Recipe, bounds: { width: number; height: number }) {
  if (!performanceScenario(recipe).feedback) return null;
  const clicks = Array.from({ length: 19 }, (_, index) => ({
    id: `performance-click-${index}`,
    time: 1 + index * 2,
    recordingPoint: { x: 0.2 + (index % 4) * 0.15, y: 0.3 + (index % 3) * 0.1 },
  }));
  const keys = Array.from({ length: 19 }, (_, index) => ({
    id: `performance-key-${index}`,
    time: 1.3 + index * 2,
  }));
  return {
    actionEvents: [
      ...clicks.map((click) => ({
        ...click,
        kind: 'CLICK',
        duration: 0,
        point: {
          x: click.recordingPoint.x * bounds.width,
          y: click.recordingPoint.y * bounds.height,
        },
        label: '',
        data: {},
        preset: 'NONE',
      })),
      ...keys.map((key) => ({
        ...key,
        kind: 'KEY',
        duration: 0,
        point: null,
        label: 'Ctrl+Shift+S',
        data: {},
        preset: 'NONE',
      })),
    ].sort((left, right) => left.time - right.time),
    clickAnimations: clicks.map(({ id }) => ({
      ...REVIEW_CLICK_DEFAULT,
      id,
      effect: 'ripple' as const,
      after: 1.2,
    })),
    keyAnimations: keys.map(({ id }) => ({ ...REVIEW_KEY_DEFAULT, id, enabled: true, after: 1.2 })),
  };
}

export async function seedPerformanceFeedback(
  page: Page,
  recipe: Recipe,
  bounds: { width: number; height: number }
) {
  const feedback = performanceFeedback(recipe, bounds);
  if (!feedback) return;
  await page.evaluate(async (actionEvents) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction('recording_telemetry', 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      transaction.objectStore('recording_telemetry').put({
        recordingId: 'beta-v1-recording',
        captureMode: 'TAB',
        createdAt: 1,
        updatedAt: 1,
        viewport: null,
        cursorTrack: null,
        signals: [],
        actionEvents,
      });
      await done;
    } finally {
      db.close();
    }
  }, feedback.actionEvents);
}

export function performanceBackground(recipe: Recipe): QuickEditBackgroundSettings | null {
  const scenario = performanceScenario(recipe);
  if (!scenario.decorated) return null;
  const layout = {
    padding: 8,
    cornerRadius: 12,
    shadow: { color: '#000000ff', intensity: 50 },
    ...(scenario.backgroundBlur ? { blur: 16 } : {}),
  };
  if (!scenario.gradient)
    return {
      enabled: true,
      type: 'solid',
      color: '#778899ff',
      zoomBehavior: 'follow-video',
      layout,
    };
  let stop = 0;
  const paint = createGradientPaint(
    '#778899ff',
    () => `performance-stop-${stop++}`,
    scenario.gradient
  );
  if (paint.kind !== 'gradient') throw new Error('Performance gradient fixture is invalid');
  return {
    enabled: true,
    type: 'gradient',
    layout,
    zoomBehavior: 'follow-video',
    gradient: {
      ...paint.gradient,
      stops: paint.gradient.stops.map((entry, index) => ({
        ...entry,
        color: index ? '#111827ff' : '#778899ff',
      })),
    },
  };
}
