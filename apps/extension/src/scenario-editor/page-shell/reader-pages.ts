import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';

/** Output preferences are disposable; they never change the canonical project. */
export type GuideReadingOptions = { mode: 'flow' | 'steps'; navigation: 'top' | 'side' };
export const DEFAULT_GUIDE_READING: GuideReadingOptions = { mode: 'flow', navigation: 'top' };
type GuideReadingPage = { id: string; items: GuideProject['items'] };

/** Section introductions travel with the next step; trailing prose remains accessible. */
export function guideReadingPages(items: GuideProject['items']): GuideReadingPage[] {
  const pages: GuideReadingPage[] = [];
  let pending: GuideProject['items'] = [];
  for (const item of items) {
    pending.push(item);
    if (item.kind === 'step') {
      pages.push({ id: item.id, items: pending });
      pending = [];
    }
  }
  if (pending.length) pages.push({ id: pending[0]!.id, items: pending });
  return pages;
}
