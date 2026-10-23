import { isRecord, isBoundedNumber } from '../validation/primitives';
import { isActionKeyStyle } from '../validation/action-style';
import { getActionKeyStyle } from '../action-style';
import type { VideoActionKeyStyle } from '../types/interaction';

/** Authored caption lengths use a stable viewport width in preview and export. */
export const REVIEW_KEY_VIEWPORT_WIDTH = 1920;

/** Authored presentation never rewrites the recorded command or timestamp. */
export interface ReviewKeyStyle {
  enabled: boolean;
  before: number;
  after: number;
  offset: number;
  style: VideoActionKeyStyle;
}
export type ReviewKeyPatch = Partial<Omit<ReviewKeyStyle, 'style'>> & {
  style?: Partial<VideoActionKeyStyle>;
};
export interface ReviewKeyAnimation extends ReviewKeyStyle {
  id: string;
}
export const REVIEW_KEY_DEFAULT: Readonly<ReviewKeyStyle> = {
  enabled: false,
  before: 0,
  after: 1.2,
  offset: 0,
  style: { ...getActionKeyStyle(), opacity: 1, background: '#18202ceb' },
};

/** Optional absence must survive legacy replay without manufacturing operations. */
export function parseReviewKeyAnimations(raw: unknown): ReviewKeyAnimation[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 10_000) return null;
  const result: ReviewKeyAnimation[] = [];
  const ids = new Set<string>();
  for (const value of raw) {
    if (
      !isRecord(value) ||
      typeof value['id'] !== 'string' ||
      !value['id'].trim() ||
      value['id'].length > 256 ||
      ids.has(value['id']) ||
      typeof value['enabled'] !== 'boolean' ||
      !isBoundedNumber(value['before'], 0, 2) ||
      !isBoundedNumber(value['after'], 0.05, 5) ||
      !isBoundedNumber(value['offset'], -2, 2) ||
      !isActionKeyStyle(value['style'])
    )
      return null;
    ids.add(value['id']);
    result.push({
      id: value['id'],
      enabled: value['enabled'],
      before: value['before'],
      after: value['after'],
      offset: value['offset'],
      style: { ...value['style'] },
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
export function patchReviewKeys(
  current: readonly ReviewKeyAnimation[],
  ids: readonly string[],
  patch: ReviewKeyPatch | null
): ReviewKeyAnimation[] {
  const values = new Map(current.map((item) => [item.id, item]));
  for (const id of new Set(ids)) {
    if (patch === null) values.delete(id);
    else
      values.set(id, {
        ...REVIEW_KEY_DEFAULT,
        ...values.get(id),
        ...patch,
        style: { ...REVIEW_KEY_DEFAULT.style, ...values.get(id)?.style, ...patch.style },
        id,
      });
  }
  const result = parseReviewKeyAnimations([...values.values()]);
  if (!result) throw new Error('Key presentation is invalid.');
  return result;
}
