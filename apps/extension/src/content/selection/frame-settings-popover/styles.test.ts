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

  it('keeps the frame-and-fill section joined to the preceding effect controls', () => {
    expect(stylesheet).toMatch(
      /\.sniptale-frame-settings-popover\.sniptale-content-popover--toolbar-menu[\s\S]*?\+\s*\.sniptale-frame-decoration-section\s*\{[^}]*border-top:\s*0;/s
    );
  });

  it('uses the normal cursor for non-interactive popover space', () => {
    expect(stylesheet).toMatch(/\.sniptale-frame-settings-popover\s*\{[^}]*cursor:\s*default;/s);
  });

  it('reveals unboxed actions on row interaction', () => {
    expect(stylesheet).toContain(
      '.sniptale-frame-style-preset-row:hover .sniptale-frame-style-preset-actions'
    );
    expect(stylesheet).toMatch(
      /\.sniptale-frame-style-preset-action\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s
    );
  });

  it('sizes the shared scrollable preset list for five frame presets', () => {
    expect(stylesheet).toContain('--sniptale-preset-list-max-height: min(242px');
    expect(stylesheet).not.toMatch(/\.sniptale-frame-settings-popover\s*\{[^}]*overflow-y:/s);
  });
});
