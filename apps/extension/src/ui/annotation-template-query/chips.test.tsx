import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AnnotationTemplatePresetMetaLine, AnnotationTemplateTagChips } from './chips';

it('shows at most two tag chips and an accessible overflow count', () => {
  const markup = renderToStaticMarkup(
    <AnnotationTemplateTagChips
      tags={[
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ]}
    />
  );
  expect(markup).toContain('aria-label="One, Two, Three"');
  expect(markup).toContain('+1');
  expect(markup).not.toContain('>Three<');
});

it('keeps a preset name and its tag chips in one clipped row', () => {
  const markup = renderToStaticMarkup(
    <AnnotationTemplatePresetMetaLine
      name={<span>Review frame</span>}
      tags={[{ id: 'review', label: 'Review' }]}
    />
  );
  expect(markup).toContain('preset-meta-line');
  expect(markup).toContain('items-center');
  expect(markup).toContain('flex-nowrap');
});
