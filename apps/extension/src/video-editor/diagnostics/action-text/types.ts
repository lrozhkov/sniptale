import type { DiagnosticEvent } from '@sniptale/platform/observability/diagnostics/types';

export type ElementRole =
  | 'button'
  | 'link'
  | 'input'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'tab'
  | 'menu'
  | 'menuitem'
  | 'icon'
  | 'text'
  | 'image'
  | 'unknown';

export interface HumanReadableAction {
  tsMs: number;
  kind: 'click' | 'keydown' | 'scroll' | 'input' | 'change';
  displayText: string;
  raw: DiagnosticEvent;
}

export interface TargetData {
  tagName?: string;
  id?: string;
  className?: string;
  type?: string;
  href?: string;
  text?: string;
  ariaLabel?: string;
  title?: string;
  role?: string;
  placeholder?: string;
  value?: string;
  selector?: string;
}
