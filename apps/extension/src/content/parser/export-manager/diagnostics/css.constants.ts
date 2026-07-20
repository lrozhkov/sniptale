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
] as const;

export type StylesheetMetadata = {
  disabled: boolean;
  href: string | null;
  media: string[];
  owner: Record<string, unknown> | null;
  path: string;
  restricted: boolean;
  ruleCount: number | null;
  source: 'document' | 'adopted';
};

export type ComputedStyleSnapshot = {
  elementRef: string;
  path: string;
  rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  styles: Record<string, string>;
  tagName: string;
};
