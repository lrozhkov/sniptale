import { sourceToReviewResult, type ReviewTimeSegment } from '../timeline';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION, type QuickEditAdvancedState } from './types';

type QuickEditAdvancedFields = Omit<QuickEditAdvancedState, 'schemaVersion' | 'recoveryV1'>;

/**
 * v1 placements were written in source-video time; v2 owns result time. Removed
 * source points cannot be proven in result time, so those placements keep their
 * stored value but are marked dormant and never apply; the raw v1 payload is
 * retained verbatim as the recovery copy.
 */
export function migrateQuickEditAdvancedV1(
  fields: QuickEditAdvancedFields,
  segments: readonly ReviewTimeSegment[]
): QuickEditAdvancedState {
  const region = (region: QuickEditAdvancedFields['zoom']['regions'][number]) => {
    const start = sourceToReviewResult(region.start, segments);
    const end = sourceToReviewResult(region.end, segments);
    if (start === null || end === null) return { ...region, dormant: true };
    // Degenerate conversions stay dormant instead of inventing an interval.
    return start < end ? { ...region, start, end, dormant: false } : { ...region, dormant: true };
  };
  const clip = (clip: QuickEditAdvancedFields['audio']['voiceover'][number]) => {
    const start = sourceToReviewResult(clip.timelineStart, segments);
    return start === null
      ? { ...clip, dormant: true }
      : { ...clip, timelineStart: start, dormant: false };
  };
  return {
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    recoveryV1: JSON.stringify({ ...fields, schemaVersion: 1 }),
    ui: fields.ui,
    background: fields.background,
    zoom: {
      ...fields.zoom,
      regions: fields.zoom.regions.map(region),
    },
    audio: {
      ...fields.audio,
      voiceover: fields.audio.voiceover.map(clip),
      music: fields.audio.music.map(clip),
    },
  };
}
