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

/** Authored boundaries split automatic flow without creating spacer content. */
export function splitGuideBlockRows(blocks: readonly GuideBlock[]): GuideBlock[][] {
  const rows: GuideBlock[][] = [];
  for (const block of blocks) {
    if (!rows.length || block.rowStart) rows.push([]);
    rows[rows.length - 1]!.push(block);
  }
  return rows;
}

/** Percentage packing matches renderer gap compensation and retains authored row starts. */
export function resolveGuideRows(step: Pick<GuideStep, 'layout' | 'blocks'>): GuideBlock[][] {
  const rows: GuideBlock[][] = [];
  let used = 0;
  for (const block of step.blocks) {
    const width = resolveGuideBlockWidth(step.layout, block);
    if (!rows.length || block.rowStart || used + width > 100) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1]!.push(block);
    used += width;
  }
  return rows;
}
