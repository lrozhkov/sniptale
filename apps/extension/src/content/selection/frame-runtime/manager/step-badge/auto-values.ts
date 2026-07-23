import {
  CYRILLIC_ALPHABET,
  LATIN_ALPHABET,
  type FrameData,
  type StepBadgeSettings,
} from '../../../../../features/highlighter/contracts';
import { sortFramesByStoredStepBadgeOrder } from './order';

export function applyAutoStepBadgeValues(
  frames: FrameData[],
  orderMap: Map<string, number>,
  excludeFrameId?: string
) {
  const framesWithBadges = getAutoStepBadgeFrames(frames, orderMap, excludeFrameId);
  if (framesWithBadges.length === 0) {
    return frames;
  }

  const frameIdToValue = buildAutoStepBadgeValueMap(frames, orderMap, excludeFrameId);
  return frames.map((frame) => {
    if (
      frame.id === excludeFrameId ||
      !frame.stepBadge?.enabled ||
      frame.stepBadge.auto === false
    ) {
      return frame;
    }

    const value = frameIdToValue.get(frame.id);
    return value === undefined ? frame : { ...frame, stepBadge: { ...frame.stepBadge, value } };
  });
}

function getStepBadgeGroupKey(settings: StepBadgeSettings): string {
  if (settings.type === 'number') {
    return 'number';
  }
  return `letter:${settings.alphabet ?? 'cyrillic'}`;
}

function getAutoStepBadgeFrames(
  frames: FrameData[],
  orderMap: Map<string, number>,
  excludeFrameId?: string
): FrameData[] {
  const originalIndexMap = new Map<string, number>();
  frames.forEach((frame, index) => {
    originalIndexMap.set(frame.id, index);
  });

  const framesWithBadges = frames.filter(
    (frame) =>
      frame.id !== excludeFrameId && frame.stepBadge?.enabled && frame.stepBadge.auto !== false
  );

  const groups = new Map<string, FrameData[]>();
  framesWithBadges.forEach((frame) => {
    const key = getStepBadgeGroupKey(frame.stepBadge!);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(frame);
  });

  const sortedFrames: FrameData[] = [];
  groups.forEach((groupFrames) => {
    sortedFrames.push(
      ...sortFramesByStoredStepBadgeOrder(groupFrames, orderMap, (a, b) => {
        const indexA = originalIndexMap.get(a.id) ?? 0;
        const indexB = originalIndexMap.get(b.id) ?? 0;
        return indexA - indexB;
      })
    );
  });

  return sortedFrames;
}

function buildAutoStepBadgeValueMap(
  frames: FrameData[],
  orderMap: Map<string, number>,
  excludeFrameId?: string
): Map<string, string> {
  const groups = new Map<string, FrameData[]>();

  getAutoStepBadgeFrames(frames, orderMap, excludeFrameId).forEach((frame) => {
    const key = getStepBadgeGroupKey(frame.stepBadge!);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(frame);
  });

  const frameIdToValue = new Map<string, string>();
  groups.forEach((groupFrames, key) => {
    const [, letterAlphabet] = key.split(':');
    const alphabet = key.startsWith('letter:')
      ? letterAlphabet === 'cyrillic'
        ? CYRILLIC_ALPHABET
        : LATIN_ALPHABET
      : null;

    groupFrames.forEach((frame, index) => {
      const badgeValue =
        key === 'number'
          ? String(index + 1)
          : alphabet && index < alphabet.length
            ? (alphabet[index] ?? '')
            : '';
      frameIdToValue.set(frame.id, badgeValue);
    });
  });

  return frameIdToValue;
}
