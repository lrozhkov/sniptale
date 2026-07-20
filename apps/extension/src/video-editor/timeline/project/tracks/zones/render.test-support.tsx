import { act } from 'react';
import type { Root } from 'react-dom/client';
import { vi } from 'vitest';

import type { VideoEditorEffectDocumentDataTransfer } from '../../../../contracts/effect-document-drag';
import { ProjectTimelineTrackZones } from './index';

const CUT_ZONES = [{ id: 'cut-zone', time: 3 }];
const GAP_ZONES = [{ end: 3, id: 'gap-zone', start: 2, trackId: 'track-1' }];
const JUNCTION_ZONES = [
  {
    detail: 'transition detail',
    end: 5,
    id: 'transition-zone',
    label: '1 videoEditor.timeline.secondsSuffix',
    stackIndex: 0,
    start: 4,
    title: 'transition title',
    zoneClassName: 'transition-zone',
    zoneSelectedClassName: 'transition-zone-selected',
  },
];
const STACKED_OVERLAP_ZONES = [{ end: 4.5, id: 'stacked-zone-a|stacked-zone-b', start: 3.5 }];

export function renderTrackZones(root: Root | null) {
  const onDropEffectDocument = vi.fn();
  const onSelectTransition = vi.fn();
  act(() => {
    root?.render(
      <div className="relative h-20">
        <ProjectTimelineTrackZones
          cutZones={CUT_ZONES}
          gapZones={GAP_ZONES}
          junctionZones={JUNCTION_ZONES}
          pixelsPerSecond={20}
          selectedTransitionId={null}
          stackedOverlapZones={STACKED_OVERLAP_ZONES}
          onCloseTrackGap={vi.fn()}
          onDropEffectDocument={onDropEffectDocument}
          onSelectTransition={onSelectTransition}
        />
      </div>
    );
  });
  return { onDropEffectDocument, onSelectTransition };
}

export function createEffectDocumentDataTransfer(): VideoEditorEffectDocumentDataTransfer {
  const values = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
    getData: (type: string) => values.get(type) ?? '',
    setData: (type: string, value: string) => {
      values.set(type, value);
    },
    get types() {
      return [...values.keys()];
    },
  };
}

export function createEffectDocumentDragEvent(
  type: string,
  dataTransfer: VideoEditorEffectDocumentDataTransfer
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return event;
}
