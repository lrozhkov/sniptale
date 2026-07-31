export const PAGE_STYLE_ALLOWED_PROPERTIES = [
  'background-color',
  'border-bottom-color',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-bottom-style',
  'border-bottom-width',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-top-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-top-style',
  'border-top-width',
  'box-shadow',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'letter-spacing',
  'line-height',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'object-fit',
  'object-position',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-decoration',
  'width',
] as const;

export type PageStyleProperty = (typeof PAGE_STYLE_ALLOWED_PROPERTIES)[number];

export interface PageStyleDeclaration {
  property: PageStyleProperty;
  value: string | null;
}

export interface PageStylePatch {
  declarations: PageStyleDeclaration[];
}

export function isPageStyleProperty(value: unknown): value is PageStyleProperty {
  return (
    typeof value === 'string' && PAGE_STYLE_ALLOWED_PROPERTIES.includes(value as PageStyleProperty)
  );
}
