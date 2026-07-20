// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  dangerPanelButtonClassName,
  documentActionsSurfaceClassName,
  neutralPanelButtonClassName,
  primaryPanelButtonClassName,
  secondaryPanelButtonClassName,
  tertiaryPanelButtonClassName,
} from './shared';

describe('document action shared UI', () => {
  it('keeps file action rows transparent until hover or focus', () => {
    expect(documentActionsSurfaceClassName).toBe('space-y-1.5');
    expect(primaryPanelButtonClassName).toContain('inline-flex');
    expect(primaryPanelButtonClassName).toContain('h-10');
    expect(primaryPanelButtonClassName).toContain('bg-transparent');
    expect(primaryPanelButtonClassName).toContain('hover:bg-');
    expect(secondaryPanelButtonClassName).toContain('bg-transparent');
    expect(neutralPanelButtonClassName).toContain(
      'text-[color:var(--sniptale-color-text-primary)]'
    );
    expect(neutralPanelButtonClassName).toContain('bg-transparent');
    expect(neutralPanelButtonClassName).toContain('hover:bg-');
    expect(neutralPanelButtonClassName).not.toContain(
      'text-[color:var(--sniptale-color-text-secondary)]'
    );
    expect(tertiaryPanelButtonClassName).toContain('text-[12px] font-medium');
    expect(tertiaryPanelButtonClassName).toContain('bg-transparent');
    expect(dangerPanelButtonClassName).toContain('var(--sniptale-color-danger)');
    expect(dangerPanelButtonClassName).toContain('bg-transparent');
  });
});
