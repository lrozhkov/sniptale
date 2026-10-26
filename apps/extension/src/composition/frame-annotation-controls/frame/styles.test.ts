import { readFileSync } from 'node:fs';
import { parse } from 'postcss';
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
    const sharedStylesheet = parse(
      readFileSync(new URL('../popover/styles.css', import.meta.url), 'utf8')
    );
    const expectedRules = [
      {
        selector: '.sniptale-frame-style-preset-row:hover .sniptale-frame-style-preset-actions',
        declarations: { opacity: '1', 'pointer-events': 'auto' },
      },
      {
        selector:
          '.sniptale-frame-style-preset-row:focus-within .sniptale-frame-style-preset-actions',
        declarations: { opacity: '1', 'pointer-events': 'auto' },
      },
      {
        selector: '.sniptale-frame-style-preset-action',
        declarations: { border: '0', background: 'transparent' },
      },
    ];
    for (const { selector, declarations } of expectedRules) {
      const rule = sharedStylesheet.nodes.find(
        (node) => node.type === 'rule' && node.selectors.includes(selector)
      );
      if (!rule || rule.type !== 'rule') throw new Error(`Missing shared style rule: ${selector}`);
      for (const [prop, value] of Object.entries(declarations)) {
        expect(rule.nodes).toContainEqual(expect.objectContaining({ type: 'decl', prop, value }));
      }
    }
  });

  it('sizes the shared scrollable preset list for five frame presets', () => {
    expect(stylesheet).toContain('--sniptale-preset-list-max-height: min(242px');
    expect(stylesheet).not.toMatch(/\.sniptale-frame-settings-popover\s*\{[^}]*overflow-y:/s);
  });
});
