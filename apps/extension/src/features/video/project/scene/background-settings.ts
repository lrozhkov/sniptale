import { parsePaint } from '@sniptale/foundation/paint';
import { isColorString, isRecord, isString, isBoundedNumber } from '../validation/primitives';
import type { VideoProjectSceneBackground, VideoProjectBackgroundVariants } from '../types';
import {
  createSceneGradientBackground,
  normalizeGradientSceneBackground,
} from './background-gradient';

type Background = VideoProjectSceneBackground;
type Kind = Background['kind'];

function parseVariant(value: unknown): Background | null {
  if (!isRecord(value) || value['remembered'] !== undefined) return null;
  if (value['kind'] !== 'image' && value['imageFit'] !== undefined) return null;
  if (value['kind'] === 'solid' && isColorString(value['color']))
    return { kind: 'solid', color: value['color'] };
  if (value['kind'] === 'gradient') {
    const paint = parsePaint({ kind: 'gradient', gradient: value['gradient'] });
    if (paint?.kind !== 'gradient') return null;
    const animation = value['animation'];
    if (animation === undefined) return { kind: 'gradient', gradient: paint.gradient };
    if (!isRecord(animation)) return null;
    const mode = animation['mode'];
    if (
      (mode !== 'none' &&
        mode !== 'rotate' &&
        mode !== 'breathe' &&
        mode !== 'drift' &&
        mode !== 'audioReactive') ||
      !isBoundedNumber(animation['speed'], 0, 100) ||
      !isBoundedNumber(animation['intensity'], 0, 100)
    )
      return null;
    return normalizeGradientSceneBackground({
      kind: 'gradient',
      gradient: paint.gradient,
      animation: { mode, speed: animation['speed'], intensity: animation['intensity'] },
    });
  }

  if (
    value['kind'] === 'image' &&
    isString(value['assetId']) &&
    (value['imageFit'] === undefined ||
      value['imageFit'] === 'cover' ||
      value['imageFit'] === 'contain')
  )
    return {
      kind: 'image',
      assetId: value['assetId'],
      ...(value['imageFit'] !== undefined ? { imageFit: value['imageFit'] } : {}),
    };
  return null;
}

/** Admit a bounded scene background and at most one retained variant of each kind. */
export function parseSceneBackgroundSettings(value: unknown): Background | null {
  if (!isRecord(value)) return null;
  const { remembered, ...active } = value;
  const parsed = parseVariant(active);
  if (!parsed) return null;
  if (remembered === undefined) return parsed;
  if (
    !isRecord(remembered) ||
    Object.keys(remembered).some((key) => !['solid', 'gradient', 'image'].includes(key))
  )
    return null;
  const variants: VideoProjectBackgroundVariants = {};
  for (const kind of ['solid', 'gradient', 'image'] as const) {
    const raw = remembered[kind];
    if (raw === undefined) continue;
    const variant = parseVariant(raw);
    if (!variant || variant.kind !== kind) return null;
    if (variant.kind === 'solid') variants.solid = variant;
    if (variant.kind === 'gradient') variants.gradient = variant;
    if (variant.kind === 'image') variants.image = variant;
  }
  return { ...parsed, remembered: variants };
}

/** Select a scene variant without changing the source clips or their coordinate domain. */
export function resolveSceneBackgroundKind(
  background: Background,
  kind: Kind,
  fallbackImageId?: string
): Background | null {
  if (background.kind === kind) return background;
  const retained = background.remembered?.[kind];
  if (retained) return retained;
  if (kind === 'solid') return { kind, color: '#111111' };
  if (kind === 'gradient') return createSceneGradientBackground();
  return fallbackImageId ? { kind, assetId: fallbackImageId } : null;
}

/** Retain the outgoing authored variant under the current project authority. */
export function retainSceneBackgroundVariants(previous: Background, next: Background): Background {
  const { remembered: _nextMemory, ...active } = next;
  if (previous.kind === next.kind)
    return {
      ...active,
      ...(previous.remembered !== undefined ? { remembered: previous.remembered } : {}),
    };
  const { remembered, ...outgoing } = previous;
  return { ...active, remembered: { ...remembered, [previous.kind]: outgoing } };
}
