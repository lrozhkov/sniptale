import type { GuideBlock, GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';

/** Editor and exported renderers resolve explicit composition before step presets. */
export function resolveGuideBlockWidth(
  layout: GuideStep['layout'],
  block: Pick<GuideBlock, 'kind' | 'width'>
): 'full' | 'half' {
  if (block.width) return block.width;
  if (layout === 'side-by-side') return 'half';
  if (layout === 'comparison' && (block.kind === 'image' || block.kind === 'image-slot'))
    return 'half';
  return 'full';
}
