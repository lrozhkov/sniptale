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
  ProjectTimelineTrackZones,
  buildTrackCutZones,
  buildTrackGapZones,
  buildTrackJunctionZones,
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
      (track) => track.name === 'Видео cut' && track.kind === VideoTrackKind.PRIMARY
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
  const cutZone = container?.querySelector('[data-ui="timeline.transition-cut-drop"]');
  const stackedCue = container?.querySelector('[data-ui="timeline.track-overlap-zone"]');
  const buttons = container?.querySelectorAll('button');

  expect(cutZone?.getAttribute('style')).toContain('left: 60px');
  expect(buttons).toHaveLength(4);
  expect(gapButton?.closest<HTMLElement>('[data-timeline-object]')?.style.left).toBe('40px');
  expect(gapButton?.closest<HTMLElement>('[data-timeline-object]')?.style.width).toBe('20px');
  expect(transitionButton?.style.left).toBe('80px');
  expect(transitionButton?.style.width).toBe('20px');
  expect(stackedCue).toBeNull();
  expect(transitionButton?.querySelector('svg path')).not.toBeNull();

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
      locked: false,
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
}

function expectSecondaryTrackZones(
  project: ReturnType<typeof createTimelineZoneProject>,
  trackId: string
) {
  expect(buildTrackCutZones(project, trackId)).toEqual([]);
  expect(buildTrackGapZones(project, trackId)).toEqual([]);
}

function expectCutTrackZones(
  project: ReturnType<typeof createTimelineZoneProject>,
  trackId: string
) {
  expect(buildTrackCutZones(project, trackId)).toEqual([
    {
      id: 'cut:clip-cut-a:clip-cut-b',
      leadingClipId: 'clip-cut-a',
      trailingClipId: 'clip-cut-b',
      time: 3,
    },
  ]);
  expect(buildTrackGapZones(project, trackId)).toEqual([]);
  expect(buildTrackJunctionZones(project, trackId)).toEqual([]);
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
      leadingClipId: 'clip-split',
      trailingClipId: expect.any(String),
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
  const missingTrack = 'missing-track';
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
  expect(buildTrackGapZones(project, missingTrack)).toEqual([]);
}

it('routes each transition boundary to its own trim without selecting the clip behind it', () => {
  const { onBeginTransitionTrim } = renderTrackZones(root);
  const start = container?.querySelector('[data-transition-trim="start"]');
  const end = container?.querySelector('[data-transition-trim="end"]');
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  act(() => start?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  act(() => end?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(onBeginTransitionTrim.mock.calls.map((call) => call.slice(1))).toEqual([
    ['transition-zone', 'start'],
    ['transition-zone', 'end'],
  ]);
});

it('keeps transition selection available without trim handles on locked tracks', () => {
  const { onSelectTransition } = renderTrackZones(root, true);
  expect(container?.querySelector('[data-transition-trim]')).toBeNull();
  const button = container?.querySelector<HTMLButtonElement>('[aria-label="transition title"]');
  act(() => button?.click());
  expect(onSelectTransition).toHaveBeenCalledWith('transition-zone');
});

it('groups gap actions as sibling buttons and recording does not collapse the gap', () => {
  const closeGap = vi.fn();
  const record = vi.fn();
  act(() =>
    root?.render(
      <ProjectTimelineTrackZones
        cutZones={[]}
        gapZones={[{ id: 'gap', trackId: 'audio', start: 1, end: 2 }]}
        pixelsPerSecond={20}
        onCloseTrackGap={closeGap}
        renderGapAction={() => <button onClick={record}>Record</button>}
      />
    )
  );
  const group = container?.querySelector('[data-ui="video-editor.timeline.gap-actions"]');
  const buttons = group?.querySelectorAll('button');
  expect(buttons).toHaveLength(2);
  expect(buttons?.[0]?.parentElement).toBe(buttons?.[1]?.parentElement);
  expect(group?.closest('button')).toBeNull();
  act(() => buttons?.[1]?.click());
  expect(record).toHaveBeenCalledOnce();
  expect(closeGap).not.toHaveBeenCalled();
  act(() => buttons?.[0]?.click());
  expect(closeGap).toHaveBeenCalledWith('audio', 1, 2);
});

it('does not accept visual effect documents on an audio junction', () => {
  const drop = vi.fn();
  act(() =>
    root?.render(
      <ProjectTimelineTrackZones
        cutZones={[]}
        gapZones={[]}
        pixelsPerSecond={100}
        onCloseTrackGap={vi.fn()}
        onDropEffectDocument={drop}
        junctionZones={[
          {
            id: 'audio-fade',
            start: 1,
            end: 2,
            audio: true,
            label: '1s',
            title: 'Crossfade',
            detail: '',
            zoneClassName: '',
            zoneSelectedClassName: '',
          },
        ]}
      />
    )
  );
  const target = container!.querySelector('[data-ui="timeline.track-transition-zone"]')!;
  const event = new Event('drop', { bubbles: true, cancelable: true });
  act(() => target.dispatchEvent(event));
  expect(drop).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});
