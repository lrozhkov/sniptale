import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('frame style catalog styles', () => {
  it('aligns section labels and preset names to their actual content axes', () => {
    expect(stylesheet).toContain(
      '.sniptale-frame-settings-popover .sniptale-content-popover-section-label'
    );
    expect(stylesheet).toMatch(/padding-inline:\s*0/);
    expect(stylesheet).toMatch(/text-align:\s*left/);
    expect(stylesheet).toMatch(
      /\.sniptale-frame-style-section\s*>\s*\.sniptale-content-popover-section-label\s*\{[^}]*padding-inline:\s*0/s
    );
    expect(stylesheet).toMatch(
      /\.sniptale-frame-style-preset-row\s+\.sniptale-glass-preset-meta\s*\{[^}]*text-align:\s*left/s
    );
  });

  it('reveals unboxed actions on row interaction', () => {
    expect(stylesheet).toContain(
      '.sniptale-frame-style-preset-row:hover .sniptale-frame-style-preset-actions'
    );
    expect(stylesheet).toMatch(
      /\.sniptale-frame-style-preset-action\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s
    );
  });

  it('keeps the add action as the final full-width catalog control', () => {
    expect(stylesheet).toContain('.sniptale-frame-style-add {');
    expect(stylesheet).toMatch(/\.sniptale-frame-style-add\s*\{[^}]*justify-content:\s*center;/s);
  });

  it('leaves catalog height to the shared scrollable preset list', () => {
    expect(stylesheet).toContain('--sniptale-preset-list-max-height:');
    expect(stylesheet).not.toMatch(/\.sniptale-frame-settings-popover\s*\{[^}]*overflow-y:/s);
  });
});
