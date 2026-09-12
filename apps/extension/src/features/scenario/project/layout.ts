import type { GuideBlock, GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';

/** Editor and exported renderers resolve explicit composition before step presets. */
export function resolveGuideBlockWidth(
  layout: GuideStep['layout'],
  block: Pick<GuideBlock, 'kind' | 'width'>
): number {
  if (typeof block.width === 'number') return block.width;
  if (block.width) return block.width === 'half' ? 50 : 100;
  if (layout === 'side-by-side') return 50;
  if (layout === 'comparison' && (block.kind === 'image' || block.kind === 'image-slot')) return 50;
  return 100;
}

/** An explicit preset action replaces width overrides, never authored content or image framing. */
export function applyGuideLayout(step: GuideStep, layout: GuideStep['layout']): GuideStep {
  return {
    ...step,
    layout,
    templateId: `builtin:${layout}`,
    blocks: step.blocks.map((block) => {
      const next = { ...block };
      delete next.width;
      return next;
    }),
  };
}
