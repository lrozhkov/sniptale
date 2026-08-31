export const MAX_COMPUTED_STYLE_TARGETS = 24;

export const COMPUTED_STYLE_TARGET_SELECTORS = [
  'main',
  '[role="main"]',
  'article',
  'form',
  'table',
  'header',
  'nav',
  'aside',
  'section',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="tooltip"]',
  '[aria-modal="true"]',
  '[data-ui]',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'img',
  'svg',
  '[class*="icon" i]',
  '[class*="glyph" i]',
  '[data-sniptale-annotation]',
] as const;

export type StylesheetMetadata = {
  disabled: boolean;
  href: string | null;
  id: string;
  media: string[];
  owner: Record<string, unknown> | null;
  restricted: boolean;
  ruleCount: number | null;
  source: 'document' | 'adopted';
  scope?: string;
};

export type ComputedStyleSnapshot = {
  matchedRules?: Array<{
    active: boolean | null;
    media: string | null;
    properties: Record<string, { important: boolean; value: string }>;
    selector: string;
    stylesheet: string | null;
  }>;
  elementRef: string;
  path: string;
  rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  styles: Record<string, string>;
  pseudoElements?: Partial<Record<'after' | 'before', Record<string, string>>>;
  tagName: string;
};
