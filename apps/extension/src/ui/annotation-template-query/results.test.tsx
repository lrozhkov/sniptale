import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AnnotationTemplateQueryResults, AnnotationTemplateQuerySurface } from './filter';

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

it('owns the shared controls and empty result behavior for template lists', () => {
  const emptyMarkup = renderToStaticMarkup(
    <AnnotationTemplateQuerySurface
      activeFilterTagIds={['review']}
      hasResults={false}
      loading={false}
      onActiveFilterTagIdsChange={() => undefined}
      onQueryChange={() => undefined}
      query="missing"
      tags={[]}
    >
      <span>Preset row</span>
    </AnnotationTemplateQuerySurface>
  );
  expect(emptyMarkup).toContain('shared.annotation-template-query.controls');
  expect(emptyMarkup).toContain('shared.annotation-template-query.results');
  expect(emptyMarkup).toContain('Очистить поиск');
  expect(emptyMarkup).toContain('Очистить фильтр');
  expect(emptyMarkup).not.toContain('Preset row');

  const populatedMarkup = renderToStaticMarkup(
    <AnnotationTemplateQuerySurface
      activeFilterTagIds={[]}
      hasResults
      loading={false}
      onActiveFilterTagIdsChange={() => undefined}
      onQueryChange={() => undefined}
      query=""
      tags={[]}
    >
      <span>Preset row</span>
    </AnnotationTemplateQuerySurface>
  );
  expect(populatedMarkup).toContain('Preset row');
});
