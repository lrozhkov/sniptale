// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import {
  buildExtendedDiagnosticDomProjection,
  MAX_EXTENDED_DIAGNOSTIC_DOM_INPUT_BYTES,
  MAX_EXTENDED_DIAGNOSTIC_ELEMENTS,
} from './extended-evidence.dom';

beforeEach(() => {
  vi.restoreAllMocks();
  document.documentElement.innerHTML = `
    <head><script>never-export-script-body</script></head>
    <body>
      <main class="layout">
        <a href="https://user:pass@example.test/page?view=grid&token=secret#x"
           ping="https://alice:hunter2@collector.test/a https://collector.test/b?view=full&token=ping-secret">Visible</a>
        <img srcset="data:text/plain,private-payload 1x, https://bob:password@cdn.test/photo.png?size=2&key=srcset-secret 2x">
        <source data-image-srcset="https://carol:password@img.test/a.png?size=1 1x, https://img.test/b.png?size=2 2x">
      </main>
      <input value="private-value"><textarea>private-textarea</textarea>
      <div id="${CONTENT_ROOT_ID}">extension-owned</div>
    </body>
  `;
});

describe('extended diagnostic DOM projection', () => {
  it('retains useful structure as inert text while excluding executable and form state', () => {
    const projection = buildExtendedDiagnosticDomProjection(document);
    expect(projection.html).toContain('class="layout"');
    expect(projection.html).toContain('>Visible</a>');
    expect(projection.html).toContain('view=grid');
    expect(projection.html).toMatch(/token=(?:redacted|\*{3})/);
    expect(projection.html).not.toContain('user:pass');
    expect(projection.html).not.toContain('alice:hunter2');
    expect(projection.html).not.toContain('bob:password');
    expect(projection.html).not.toContain('carol:password');
    expect(projection.html).not.toContain('private-payload');
    expect(projection.html).not.toContain('#x');
    expect(projection.html).toContain('[data URL redacted] 1x');
    expect(projection.html).toContain('size=2');
    expect(projection.html).toContain(
      'data-image-srcset="https://img.test/a.png?size=1 1x, https://img.test/b.png?size=2 2x"'
    );
    expect(projection.html).not.toContain('<script');
    expect(projection.html).not.toContain('never-export-script-body');
    expect(projection.html).not.toContain('private-value');
    expect(projection.html).not.toContain('private-textarea');
    expect(projection.html).not.toContain('extension-owned');
    expect(projection.redactions.map((entry) => entry.reason)).toEqual(
      expect.arrayContaining([
        'executable-element',
        'extension-owned-element',
        'form-control-state',
      ])
    );
  });

  it('keeps long valid SVG path data parseable while redacting diagnostic attributes', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const pathData = `M0 0 ${Array.from({ length: 80 }, (_, index) => `L${index + 1} ${index + 1}`).join(' ')} Z`;
    path.setAttribute('d', pathData);
    path.setAttribute('data-token', 'diagnostic-secret');
    svg.append(path);
    document.body.append(svg);

    const projection = buildExtendedDiagnosticDomProjection(document);

    expect(projection.html).toContain(`d="${pathData}"`);
    expect(projection.html).not.toContain('... [truncated]');
    expect(projection.html).not.toContain('diagnostic-secret');
  });

  it('rejects an oversized element frontier before cloning', () => {
    const root = document.documentElement;
    let remaining = MAX_EXTENDED_DIAGNOSTIC_ELEMENTS;
    const treeWalker = vi.spyOn(document, 'createTreeWalker').mockReturnValue({
      nextNode: () => (remaining-- > 0 ? root : null),
    } as TreeWalker);
    expect(() => buildExtendedDiagnosticDomProjection(document)).toThrow('element limit');
    expect(treeWalker).toHaveBeenCalledOnce();
  });

  it('rejects one oversized DOM scalar before cloning the document', () => {
    document.body.textContent = 'x'.repeat(MAX_EXTENDED_DIAGNOSTIC_DOM_INPUT_BYTES + 1);
    const clone = vi.spyOn(document.documentElement, 'cloneNode');

    expect(() => buildExtendedDiagnosticDomProjection(document)).toThrow('input byte limit');
    expect(clone).not.toHaveBeenCalled();
  });

  it('admits and sanitizes serialization-relevant template contents', () => {
    const template = document.createElement('template');
    template.innerHTML = `
      <script>template-script-secret</script>
      <button onclick="template-handler-secret">Visible template label</button>
      <textarea>template-form-secret</textarea>
    `;
    document.body.append(template);

    const projection = buildExtendedDiagnosticDomProjection(document);

    expect(projection.html).toContain('Visible template label');
    expect(projection.html).not.toContain('template-script-secret');
    expect(projection.html).not.toContain('template-handler-secret');
    expect(projection.html).not.toContain('template-form-secret');
    expect(projection.html).not.toContain('<script');
  });

  it('rejects an oversized template scalar before cloning', () => {
    const template = document.createElement('template');
    template.content.append(
      document.createTextNode('x'.repeat(MAX_EXTENDED_DIAGNOSTIC_DOM_INPUT_BYTES + 1))
    );
    document.body.append(template);
    const clone = vi.spyOn(document.documentElement, 'cloneNode');

    expect(() => buildExtendedDiagnosticDomProjection(document)).toThrow('input byte limit');
    expect(clone).not.toHaveBeenCalled();
  });

  it('streams hostile attributes during admission without materializing an attribute array', () => {
    const target = document.createElement('div');
    for (let index = 0; index < 4_097; index += 1) {
      target.setAttribute(`data-field-${index}`, 'x'.repeat(8 * 1024));
    }
    document.body.append(target);
    const arrayFrom = vi.spyOn(Array, 'from');
    const clone = vi.spyOn(document.documentElement, 'cloneNode');

    expect(() => buildExtendedDiagnosticDomProjection(document)).toThrow('input byte limit');
    expect(arrayFrom).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
  });
});
