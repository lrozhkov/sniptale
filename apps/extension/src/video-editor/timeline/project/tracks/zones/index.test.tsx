// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import { splitProjectClipsAtTime } from '../../../../project/state/clip-timeline/mutations';
import { VideoTrackKind } from '../../../../../features/video/project/types';
import { writeVideoEditorEffectDocumentDragPayload } from '../../../../contracts/effect-document-drag';
import {
  buildTrackCutZones,
  buildTrackGapZones,
  buildTrackJunctionZones,
  buildTrackStackedOverlapZones,
} from './index';
import { createTimelineZoneAsset, createTimelineZoneProject } from './test-support';
import {
  createEffectDocumentDataTransfer,
  createEffectDocumentDragEvent,
  renderTrackZones,
} from './render.test-support';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  formatNumber: (value: number) => String(value),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const CROSSFADE_DETAIL =
  'videoEditor.templates.transitionGroupCore · videoEditor.sidebar.transitionRenderComposite';
const CROSSFADE_TITLE = `videoEditor.sidebar.transitionCrossfade · ${CROSSFADE_DETAIL}`;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('project timeline track zones', () => {
  it(
    'derives same-track junction zones and stacked overlap cues from project composition',
    verifyTrackZoneDerivation
  );
  it(
    'derives a hard cut seam from split clips without creating a transition junction',
    verifySplitCutZone
  );
  it('derives positive gap zones only for video and audio tracks', verifyGapZoneDerivation);
  it(
    'renders ordinary track cues and an interactive EffectV1 transition junction',
    verifyTrackZoneRendering
  );
});

function verifyTrackZoneDerivation() {
  const project = createTimelineZoneProject();
  const primaryTrack = project.tracks[0]?.id ?? '';
  const secondaryTrack =
    project.tracks.find(
      (track) => track.id !== primaryTrack && track.kind === VideoTrackKind.PRIMARY
    )?.id ?? '';
  const cutTrack =
    project.tracks.find(
      (track) => track.name === 'Видео cut' && track.kind === VideoTrackKind.OVERLAY
    )?.id ?? '';

  expectPrimaryTrackZones(project, primaryTrack);
  expectSecondaryTrackZones(project, secondaryTrack);
  expectCutTrackZones(project, cutTrack);
}

function verifyTrackZoneRendering() {
  const { onDropEffectDocument, onSelectTransition } = renderTrackZones(root);
  const gapButton = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="videoEditor.timeline.closeGap"]'
  );
  const transitionButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="timeline.track-transition-zone"]'
  );
  const cutZone = container?.querySelector('div.pointer-events-none.absolute.inset-y-3.z-20');
  const stackedCue = container?.querySelector('[data-ui="timeline.track-overlap-zone"]');
  const buttons = container?.querySelectorAll('button');

  expect(cutZone?.getAttribute('style')).toContain('left: 60px');
  expect(buttons).toHaveLength(2);
  expect(gapButton?.style.left).toBe('40px');
  expect(gapButton?.style.width).toBe('20px');
  expect(stackedCue?.getAttribute('style')).toContain('left: 70px');
  expect(stackedCue?.getAttribute('style')).toContain('width: 20px');
  expect(stackedCue?.className).toContain('inset-y-2');
  expect(transitionButton?.style.left).toBe('80px');
  expect(transitionButton?.style.width).toBe('28px');

  act(() => transitionButton?.click());
  expect(onSelectTransition).toHaveBeenCalledWith('transition-zone');

  const dataTransfer = createEffectDocumentDataTransfer();
  writeVideoEditorEffectDocumentDragPayload(dataTransfer, {
    documentId: 'document.transition',
    kind: 'transition',
    packId: 'pack.effects',
  });
  const dragOver = createEffectDocumentDragEvent('dragover', dataTransfer);
  const drop = createEffectDocumentDragEvent('drop', dataTransfer);
  act(() => {
    transitionButton?.dispatchEvent(dragOver);
    transitionButton?.dispatchEvent(drop);
  });

  expect(dragOver.defaultPrevented).toBe(true);
  expect(onDropEffectDocument).toHaveBeenCalledWith(
    {
      documentId: 'document.transition',
      kind: 'transition',
      packId: 'pack.effects',
    },
    { kind: 'transition', transitionId: 'transition-zone' },
    4
  );
}

function expectPrimaryTrackZones(
  project: ReturnType<typeof createTimelineZoneProject>,
  trackId: string
) {
  expect(buildTrackCutZones(project, trackId)).toEqual([]);
  expect(buildTrackGapZones(project, trackId)).toEqual([]);
  expect(buildTrackJunctionZones(project, trackId)).toEqual([
    {
      detail: CROSSFADE_DETAIL,
      end: 5,
      id: 'transition-1',
      label: '1 videoEditor.timeline.secondsSuffix',
      stackIndex: 0,
      start: 4,
      title: CROSSFADE_TITLE,
      zoneClassName: expect.stringContaining('var(--sniptale-color-accent)'),
      zoneSelectedClassName: expect.stringContaining('var(--sniptale-color-border-accent-strong)'),
    },
  ]);
  expect(buildTrackStackedOverlapZones(project, trackId)).toEqual([
    {
      end: 6,
      id: 'clip-a:clip-c|clip-b:clip-c',
      start: 2,
    },
  ]);
}

function expectSecondaryTrackZones(
  project: ReturnType<typeof createTimelineZoneProject>,
  trackId: string
) {
  expect(buildTrackCutZones(project, trackId)).toEqual([]);
  expect(buildTrackGapZones(project, trackId)).toEqual([]);
  expect(buildTrackStackedOverlapZones(project, trackId)).toEqual([
    {
      end: 6,
      id: 'clip-c:clip-a|clip-c:clip-b',
      start: 2,
    },
  ]);
}

function expectCutTrackZones(
  project: ReturnType<typeof createTimelineZoneProject>,
  trackId: string
) {
  expect(buildTrackCutZones(project, trackId)).toEqual([
    {
      id: 'cut:clip-cut-a:clip-cut-b',
      time: 3,
    },
  ]);
  expect(buildTrackGapZones(project, trackId)).toEqual([]);
  expect(buildTrackJunctionZones(project, trackId)).toEqual([]);
  expect(buildTrackStackedOverlapZones(project, trackId)).toEqual([]);
}

function verifySplitCutZone() {
  const project = createEmptyVideoProject('Split seam');
  const trackId = project.tracks[0]?.id ?? '';
  const asset = createTimelineZoneAsset('asset-split');
  const clip = createVideoClipFromAsset(trackId, asset, 1280, 720, 0);

  clip.id = 'clip-split';
  clip.duration = 6;

  const splitProject = splitProjectClipsAtTime(
    {
      ...project,
      assets: [asset],
      clips: [clip],
    },
    clip.id,
    2.5
  );

  expect(buildTrackCutZones(splitProject, trackId)).toEqual([
    {
      id: expect.stringContaining('cut:'),
      time: 2.5,
    },
  ]);
  expect(buildTrackJunctionZones(splitProject, trackId)).toEqual([]);
  expect(buildTrackGapZones(splitProject, trackId)).toEqual([]);
}

function verifyGapZoneDerivation() {
  const project = createEmptyVideoProject('Gap seam');
  const primaryTrack = project.tracks[0]?.id ?? '';
  const audioTrack = project.tracks[1]?.id ?? '';
  const overlayTrack =
    project.tracks.find((track) => track.kind === VideoTrackKind.OVERLAY)?.id ?? '';
  const asset = createTimelineZoneAsset('asset-gap');
  const firstClip = createVideoClipFromAsset(primaryTrack, asset, 1280, 720, 0);
  const secondClip = createVideoClipFromAsset(primaryTrack, asset, 1280, 720, 3);

  firstClip.id = 'clip-gap-a';
  firstClip.duration = 1;
  secondClip.id = 'clip-gap-b';
  secondClip.duration = 1;
  project.assets = [asset];
  project.clips = [firstClip, secondClip];

  expect(buildTrackGapZones(project, primaryTrack)).toEqual([
    {
      end: 3,
      id: `gap:${primaryTrack}:clip-gap-a:clip-gap-b`,
      start: 1,
      trackId: primaryTrack,
    },
  ]);
  expect(buildTrackGapZones(project, audioTrack)).toEqual([]);
  expect(buildTrackGapZones(project, overlayTrack)).toEqual([]);
}
