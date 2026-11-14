// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import DOMPurify from 'dompurify';
import { sanitizeHtmlFragment } from './html';
import { sanitizeSvgFragment } from './svg';

vi.mock('dompurify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dompurify')>();
  return { default: Object.assign(vi.fn(actual.default), actual.default) };
});

const namespace = 'http://www.w3.org/2000/svg';
const options = {
  allowedTags: ['svg', 'g', 'path', 'rect'],
  allowedAttributes: ['xmlns', 'viewBox', 'd', 'transform', 'fill', 'id', 'width', 'height'],
};
const svg = (body: string) => `<svg xmlns="${namespace}" viewBox="0 0 24 24">${body}</svg>`;
const parse = (source: string | null) => {
  expect(source).not.toBeNull();
  return new DOMParser().parseFromString(source ?? '', 'image/svg+xml');
};

afterEach(() => vi.restoreAllMocks());

describe('SVG sanitizer', () => {
  it('retains the explicit SVG profile, namespace and geometry without HTML defaults', () => {
    const clean = parse(sanitizeSvgFragment(svg('<g><path d="M0 0h4v4z"/></g>'), options));
    expect(clean.querySelector('parsererror')).toBeNull();
    expect(clean.documentElement.namespaceURI).toBe(namespace);
    expect(clean.querySelector('path')?.getAttribute('d')).toBe('M0 0h4v4z');
    expect(
      Array.from(clean.querySelectorAll('*')).every((node) => node.namespaceURI === namespace)
    ).toBe(true);
  });

  it('removes scripts, HTML, resource tags and attributes outside the explicit profile', () => {
    const clean = parse(
      sanitizeSvgFragment(
        svg(
          '<script>alert(1)</script><style>path{fill:red}</style>' +
            '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>' +
            '<image href="https://example.invalid/image"/>' +
            '<a href="https://example.invalid/"><path d="M0 0h1v1z"/></a>' +
            '<path d="M0 0h4v4z" onclick="alert(1)" style="fill:red" data-x="x" aria-label="x"/>'
        ),
        options
      )
    );
    expect(clean.querySelector('script,style,foreignObject,image,a,div')).toBeNull();
    expect(clean.querySelector('path')?.getAttributeNames()).toEqual(['d']);
  });

  it('keeps resource and event extensions closed even when a caller includes them', () => {
    const clean = parse(
      sanitizeSvgFragment(
        svg(
          '<image href="https://example.invalid/x"/><path d="M0 0h1v1z" onload="  alert(1)  " href="  javascript:alert(1)  " style="fill:red"/>'
        ),
        {
          allowedTags: [...options.allowedTags, 'image', 'script', 'foreignObject'],
          allowedAttributes: [...options.allowedAttributes, 'onload', 'href', 'style'],
        }
      )
    );
    expect(clean.querySelector('image,script,foreignObject')).toBeNull();
    expect(clean.querySelector('path')?.getAttributeNames()).toEqual(['d']);
  });

  it('removes foreign namespaces and encoded or namespaced links before another XML parse', () => {
    const clean = parse(
      sanitizeSvgFragment(
        svg(
          '<g xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></g>' +
            '<path xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="&#106;avascript:alert(1)" d="M0 0h1v1z"/>'
        ),
        { ...options, allowedAttributes: [...options.allowedAttributes, 'xlink:href'] }
      )
    );
    expect(clean.querySelector('parsererror')).toBeNull();
    expect(clean.querySelector('path')?.hasAttribute('xlink:href')).toBe(false);
    expect(
      Array.from(clean.querySelectorAll('*')).every((node) => node.namespaceURI === namespace)
    ).toBe(true);
    const reparsed = new DOMParser().parseFromString(
      new XMLSerializer().serializeToString(clean),
      'image/svg+xml'
    );
    expect(reparsed.querySelector('script')).toBeNull();
    expect(reparsed.querySelector('path')?.hasAttribute('xlink:href')).toBe(false);
  });

  it('preserves harmless attribute whitespace before normal sanitizer validation', () => {
    const clean = parse(
      sanitizeSvgFragment(svg('<path d=" M0 0h1v1z " transform=" translate(0) "/>'), options)
    );
    expect(clean.querySelector('path')?.getAttribute('d')).toBe(' M0 0h1v1z ');
    expect(clean.querySelector('path')?.getAttribute('transform')).toBe(' translate(0) ');
  });

  it('isolates each SVG policy and hook lifetime from HTML and later SVG calls', () => {
    const factory = vi.mocked(DOMPurify);
    const first = DOMPurify(window);
    const cleanup = vi.spyOn(first, 'removeAllHooks');
    const defaultHook = vi.spyOn(DOMPurify, 'addHook');
    factory.mockReturnValueOnce(first);
    expect(sanitizeSvgFragment(svg('<rect width="1" height="1"/>'), options)).toContain('<rect');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(defaultHook).not.toHaveBeenCalled();
    expect(
      sanitizeHtmlFragment('<strong onclick="alert(1)">safe</strong>', {
        allowedTags: ['strong'],
        allowedAttributes: [],
      })
    ).toBe('<strong>safe</strong>');
    const second = parse(
      sanitizeSvgFragment(svg('<path d="M0 0h1v1z"/>'), {
        allowedTags: ['svg'],
        allowedAttributes: ['xmlns', 'viewBox'],
      })
    );
    expect(second.querySelector('path')).toBeNull();
  });

  it('fails closed on unsupported environments or purifier failures', () => {
    const supported = DOMPurify.isSupported;
    try {
      DOMPurify.isSupported = false;
      expect(sanitizeSvgFragment(svg('<path/>'), options)).toBeNull();
    } finally {
      DOMPurify.isSupported = supported;
    }
    const first = DOMPurify(window);
    const cleanup = vi.spyOn(first, 'removeAllHooks');
    vi.spyOn(first, 'sanitize').mockImplementation(() => {
      throw new Error('sanitizer failed');
    });
    vi.mocked(DOMPurify).mockReturnValueOnce(first);
    expect(sanitizeSvgFragment(svg('<path/>'), options)).toBeNull();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('fails closed when a purifier returns a DOM object instead of a string', () => {
    const purifier = DOMPurify(window);
    Object.defineProperty(purifier, 'sanitize', {
      value: () => document.createElementNS(namespace, 'svg'),
    });
    vi.mocked(DOMPurify).mockReturnValueOnce(purifier);
    expect(sanitizeSvgFragment(svg('<path/>'), options)).toBeNull();
  });
});
