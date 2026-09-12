import { expect, it } from 'vitest';
import { createGuideStep, createGuideImageBlock, createGuideParagraphs } from './factories';
import { resolveGuideBlockWidth, applyGuideLayout } from './layout';

it('resolves presets and explicit overrides identically for every block kind', () => {
  for (const kind of ['image', 'image-slot', 'text', 'heading', 'note'] as const) {
    for (const layout of ['stacked', 'text', 'side-by-side', 'comparison'] as const) {
      expect(resolveGuideBlockWidth(layout, { kind, width: 'half' })).toBe(50);
      expect(resolveGuideBlockWidth(layout, { kind, width: 'full' })).toBe(100);
      expect(resolveGuideBlockWidth(layout, { kind, width: 37 })).toBe(37);
      expect(resolveGuideBlockWidth(layout, { kind })).toBe(
        layout === 'side-by-side' ||
          (layout === 'comparison' && ['image', 'image-slot'].includes(kind))
          ? 50
          : 100
      );
    }
  }
});

it('reflows mixed authored content predictably and keeps the original step for undo', () => {
  const step = createGuideStep('Authored title', 'step');
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 1200,
    height: 800,
    source: { kind: 'import', filename: 'screenshot.png' },
    editDocumentId: 'annotations',
  });
  image.width = 37;
  image.fit = 'cover';
  image.contentTransform = { x: 0.2, y: -0.1, scale: 1.5 };
  step.blocks = [
    { kind: 'heading', id: 'heading', text: 'Heading', width: 'half' },
    image,
    { kind: 'text', id: 'text', paragraphs: createGuideParagraphs('Body'), width: 25 },
    {
      kind: 'note',
      id: 'note',
      tone: 'warning',
      paragraphs: createGuideParagraphs('Warning'),
      width: 'full',
    },
  ];
  step.numbering = { restartAt: 3 };
  step.styleOverrides = { font: 'serif' };
  const before = structuredClone(step);
  for (const layout of ['stacked', 'side-by-side', 'comparison', 'text'] as const) {
    const next = applyGuideLayout(step, layout);
    expect(next.blocks.map((block) => resolveGuideBlockWidth(layout, block))).toEqual(
      layout === 'side-by-side'
        ? [50, 50, 50, 50]
        : layout === 'comparison'
          ? [100, 50, 100, 100]
          : [100, 100, 100, 100]
    );
    expect(next).toEqual({
      ...before,
      layout,
      templateId: `builtin:${layout}`,
      blocks: before.blocks.map((block) => {
        const copy = { ...block };
        delete copy.width;
        return copy;
      }),
    });
  }
  expect(step).toEqual(before);
});

it('applies immediately to an empty step and a single captured image without adding placeholders', () => {
  const step = createGuideStep();
  expect(applyGuideLayout(step, 'comparison').blocks).toEqual([]);
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 1200,
    height: 800,
    source: { kind: 'import', filename: 'capture.png' },
  });
  step.blocks = [image];
  const next = applyGuideLayout(step, 'side-by-side');
  expect(next.blocks).toEqual([image]);
  expect(resolveGuideBlockWidth(next.layout, next.blocks[0]!)).toBe(50);
});
