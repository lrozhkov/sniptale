import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AnnotationTemplateQueryResults } from './filter';

it('reserves the results viewport and visually hides unfiltered children while tags load', () => {
  const loadingMarkup = renderToStaticMarkup(
    <AnnotationTemplateQueryResults loading>
      <span>Unfiltered preset</span>
    </AnnotationTemplateQueryResults>
  );
  expect(loadingMarkup).toContain('aria-busy="true"');
  expect(loadingMarkup).toContain('sniptale-preset-list-max-height');
  expect(loadingMarkup).toContain('class="invisible"');
  expect(loadingMarkup).toContain('Unfiltered preset');

  const readyMarkup = renderToStaticMarkup(
    <AnnotationTemplateQueryResults loading={false}>
      <span>Filtered preset</span>
    </AnnotationTemplateQueryResults>
  );
  expect(readyMarkup).toContain('Filtered preset');
});
