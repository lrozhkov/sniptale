import type { AppLocale, TranslationKey } from '../../../../platform/i18n';
import { translate } from '../../../../platform/i18n';

const ELEMENT_DESCRIPTION_KEYS: Readonly<Record<string, TranslationKey>> = {
  a: 'content.designReview.elementLink',
  article: 'content.designReview.elementArticle',
  button: 'content.designReview.elementButton',
  div: 'content.designReview.elementContainer',
  form: 'content.designReview.elementForm',
  h1: 'content.designReview.elementHeading',
  h2: 'content.designReview.elementHeading',
  h3: 'content.designReview.elementHeading',
  h4: 'content.designReview.elementHeading',
  h5: 'content.designReview.elementHeading',
  h6: 'content.designReview.elementHeading',
  img: 'content.designReview.elementImage',
  input: 'content.designReview.elementFormControl',
  li: 'content.designReview.elementListItem',
  main: 'content.designReview.elementMain',
  nav: 'content.designReview.elementNavigation',
  ol: 'content.designReview.elementList',
  p: 'content.designReview.elementParagraph',
  section: 'content.designReview.elementSection',
  select: 'content.designReview.elementFormControl',
  table: 'content.designReview.elementTable',
  textarea: 'content.designReview.elementFormControl',
  ul: 'content.designReview.elementList',
};

export function describeDesignReviewElement(tagName: string, locale?: AppLocale): string {
  const normalizedTag = tagName.toLowerCase();
  const description = translate(
    ELEMENT_DESCRIPTION_KEYS[normalizedTag] ?? 'content.designReview.elementGeneric',
    locale
  );
  return `<${normalizedTag}> — ${description}`;
}
