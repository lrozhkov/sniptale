import type { TourDocument, TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';

interface TourPlaybackEntry {
  key: string;
  sourceSlideId: string;
  actionId: string | null;
  ordinal: number | null;
  slide: TourSlide & { sourceSlideId: string };
}

/** One disposable sequence drives playback, navigation and authoring action numbers. */
export function buildTourPlaybackPlan(tour: TourDocument) {
  const entries: TourPlaybackEntry[] = [];
  let actionCount = 0;
  for (const slide of tour.slides) {
    if (slide.kind === 'navigation') {
      entries.push({
        key: slide.id,
        sourceSlideId: slide.id,
        actionId: null,
        ordinal: null,
        slide: { ...slide, sourceSlideId: slide.id },
      });
      continue;
    }
    for (const entry of slide.actions) {
      const object = entry.object;
      entries.push({
        key: object.id,
        sourceSlideId: slide.id,
        actionId: object.id,
        ordinal: ++actionCount,
        slide: {
          ...slide,
          sourceSlideId: slide.id,
          id: slide.id,
          title:
            entry.type === 'hotspot'
              ? objectLabel(entry.object.label, entry.object.text)
              : objectLabel('', entry.object.text),
          actions: [entry],
          camera: object.camera ?? slide.camera,
          timing: object.timing ?? slide.timing,
        },
      });
    }
  }
  return { entries, actionCount };
}

function objectLabel(label: string, text: string) {
  return (
    label.trim() ||
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ||
    ''
  );
}
