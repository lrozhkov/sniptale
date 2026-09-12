import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';

export type GuideResolvedNumber = { label: string | null; nextAutomaticNumber: number };

/** Resolves display labels once in document order; hidden/manual steps consume no automatic number. */
export function resolveGuideNumbering(
  items: GuideProject['items']
): Map<string, GuideResolvedNumber> {
  let next = 1;
  const numbers = new Map<string, GuideResolvedNumber>();
  for (const item of items) {
    if (item.numbering?.restartAt !== undefined) next = item.numbering.restartAt;
    let label: string | null = null;
    if (item.kind === 'step' && item.showNumber) {
      if (item.numbering?.label !== undefined) label = item.numbering.label;
      else label = String(next++);
    }
    numbers.set(item.id, { label, nextAutomaticNumber: next });
  }
  return numbers;
}
