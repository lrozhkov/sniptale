import type {
  GuideBlock,
  GuideStep,
  GuideStyle,
} from '@sniptale/runtime-contracts/scenario/types/guide';

/** Captured titles do not disqualify the quick image path; authored body content does. */
export function classifyGuideStepContent(step: GuideStep): 'empty' | 'image' | 'authored' {
  const populated = step.blocks.filter((block) => {
    if (block.kind === 'image') return true;
    if (block.kind === 'image-slot') return false;
    if (block.kind === 'heading') return Boolean(block.text.trim());
    return block.paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text.trim()));
  });
  if (populated.length === 1 && populated[0]?.kind === 'image') return 'image';
  return populated.length === 0 && !step.title.trim() ? 'empty' : 'authored';
}

/** Matching visual slots changes composition and typography without touching authored content. */
export function applyGuideTemplateAppearance(
  step: GuideStep,
  template: GuideStep,
  style: GuideStyle,
  templateId: string
): GuideStep {
  const slots = new Map<string, GuideBlock[]>();
  for (const block of template.blocks) {
    const kind = block.kind === 'image-slot' ? 'image' : block.kind;
    const entries = slots.get(kind) ?? [];
    entries.push(block);
    slots.set(kind, entries);
  }
  return {
    ...step,
    layout: template.layout,
    templateId,
    styleOverrides: { ...style, ...template.styleOverrides },
    blocks: step.blocks.map((block) => {
      const kind = block.kind === 'image-slot' ? 'image' : block.kind;
      const slot = slots.get(kind)?.shift();
      const next = { ...block };
      delete next.width;
      if (slot?.width !== undefined) next.width = slot.width;
      if (next.kind === 'text' || next.kind === 'heading' || next.kind === 'note') {
        delete next.textStyle;
        if (
          slot &&
          (slot.kind === 'text' || slot.kind === 'heading' || slot.kind === 'note') &&
          slot.textStyle
        ) {
          next.textStyle = { ...slot.textStyle };
        }
      }
      return next;
    }),
  };
}
