import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AnnotationTemplateTagChips } from './chips';

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
