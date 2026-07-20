// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';

import { buildDomSnapshotHtml } from './page-snapshot';

function appendElement(
  parent: ParentNode,
  tagName: string,
  attributes: Record<string, string> = {}
) {
  const element = document.createElement(tagName);

  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'textContent') {
      element.textContent = value;
      continue;
    }

    element.setAttribute(name, value);
  }

  parent.append(element);
  return element;
}

function resetDocumentTree() {
  document.documentElement.replaceChildren(
    document.createElement('head'),
    document.createElement('body')
  );
}

afterEach(() => {
  resetDocumentTree();
});

function addStandardUrlFixtureElements(): void {
  resetDocumentTree();
  document.documentElement.setAttribute(
    'style',
    'background: url("/root?token=known-secret#frag")'
  );
  document.documentElement.setAttribute('onload', 'send("known-secret")');
  document.documentElement.setAttribute('background', '/root-bg.png?token=known-secret#frag');
  document.documentElement.setAttribute('manifest', '/cache?token=known-secret#frag');
  appendElement(document.body, 'a', {
    href: '/download?X-Amz-Credential=known-secret&X-Amz-Signature=sig#frag',
    textContent: 'Download',
  });
  appendElement(document.body, 'img', {
    src: 'assets/photo.png?token=known-secret#frag',
  });
  appendElement(document.body, 'form', {
    action: '//cdn.example.test/submit?signature=known-secret#frag',
  });
  appendElement(document.body, 'button', {
    formaction: 'submit?X-Goog-Signature=known-secret#frag',
  });
  appendElement(document.body, 'img', {
    srcset: [
      '/small.png?X-Amz-Credential=known-secret#frag 1x',
      '//cdn.example.test/large.png?signature=known-secret#frag 2x',
    ].join(', '),
  });
  appendElement(document.body, 'img', {
    imagesrcset: 'responsive.png?X-Goog-Signature=known-secret#frag 2x',
  });
  appendElement(document.body, 'img', {
    'data-src': 'lazy.png?X-Amz-Signature=known-secret#frag',
    'data-srcset': 'lazy-small.png?X-Amz-Signature=known-secret#frag 1x',
  });
}

function addDataUrlFixtureElements(): void {
  appendElement(document.body, 'div', {
    'data-url': '/profile?q=private user text#frag',
    'data-href': '/href?X-Amz-Signature=known-secret#frag',
    'data-original': '/original?X-Goog-Signature=known-secret#frag',
    'data-original-src': '/original-src?token=known-secret#frag',
    'data-background-url': '/background?signature=known-secret#frag',
    'data-image-srcset': '/image-small?X-Amz-Signature=known-secret#frag 1x',
  });
}

function addDataSrcsetFixtureElements(): void {
  appendElement(document.body, 'source', {
    'data-srcset': 'data:image/svg+xml,<svg>X-Amz-Signature=known-secret</svg> 1x',
  });
  appendElement(document.body, 'source', {
    srcset: 'data:image/svg+xml,<svg>X-Amz-Signature=known-secret</svg> 1x',
  });
  appendElement(document.body, 'source', {
    srcset: 'data:image/svg+xml,<svg X-Amz-Signature=known-secret></svg> 2x',
  });
  appendElement(document.body, 'source', {
    imagesrcset: 'data:image/svg+xml,<svg>X-Goog-Signature=known-secret</svg> 1x',
  });
  appendElement(document.body, 'source', {
    'data-srcset': 'data:image/svg+xml,<svg X-Amz-Signature=known-secret></svg> 3x',
  });
}

function addRemovedContentFixtureElements(): void {
  appendElement(document.body, 'iframe', {
    srcdoc: '<a href="/secret?token=known-secret#frag">secret</a>',
  });
  appendElement(document.body, 'div', {
    style: 'background-image: url("/secret.png?X-Amz-Signature=known-secret#frag")',
  });
  appendElement(document.body, 'object', {
    data: '/object.swf?token=known-secret#frag',
  });
  appendElement(document.body, 'svg').setAttributeNS(
    'http://www.w3.org/1999/xlink',
    'xlink:href',
    '/vector.svg?token=known-secret#frag'
  );
  appendElement(document.body, 'blockquote', {
    cite: '/quote?token=known-secret#frag',
  });
  appendElement(document.body, 'a', {
    href: '/ping-target',
    ping: '/ping?token=known-secret#frag',
  });
  appendElement(document.body, 'table', {
    background: '/table-bg.png?token=known-secret#frag',
  });
}

function expectStandardUrlAttributesSanitized(snapshot: string): void {
  expect(snapshot).toContain('href="/download"');
  expect(snapshot).toContain('src="assets/photo.png"');
  expect(snapshot).toContain('background="/root-bg.png"');
  expect(snapshot).toContain('manifest="/cache"');
  expect(snapshot).toContain('action="//cdn.example.test/submit"');
  expect(snapshot).toContain('formaction="submit"');
  expect(snapshot).toContain('srcset="/small.png 1x, //cdn.example.test/large.png 2x"');
  expect(snapshot).toContain('imagesrcset="responsive.png 2x"');
  expect(snapshot).toContain('data-src="lazy.png"');
  expect(snapshot).toContain('data-srcset="lazy-small.png 1x"');
}

function expectDataUrlAttributesSanitized(snapshot: string): void {
  expect(snapshot).toContain('data-url="/profile"');
  expect(snapshot).toContain('data-href="/href"');
  expect(snapshot).toContain('data-original="/original"');
  expect(snapshot).toContain('data-original-src="/original-src"');
  expect(snapshot).toContain('data-background-url="/background"');
  expect(snapshot).toContain('data-image-srcset="/image-small 1x"');
}

function expectDataSrcsetAttributesSanitized(snapshot: string): void {
  expect(snapshot).toContain('data-srcset="[data URL redacted] 1x"');
  expect(snapshot).toContain('srcset="[data URL redacted] 1x"');
  expect(snapshot).toContain('srcset="[data URL redacted] 2x"');
  expect(snapshot).toContain('imagesrcset="[data URL redacted] 1x"');
  expect(snapshot).toContain('data-srcset="[data URL redacted] 3x"');
}

function expectRemovedContentAttributesSanitized(snapshot: string): void {
  expect(snapshot).toContain('data="/object.swf"');
  expect(snapshot).toContain('xlink:href="/vector.svg"');
  expect(snapshot).toContain('cite="/quote"');
  expect(snapshot).toContain('ping="/ping"');
  expect(snapshot).toContain('background="/table-bg.png"');
  expect(snapshot).not.toContain('srcdoc=');
  expect(snapshot).not.toContain('style=');
  expect(snapshot).not.toContain('known-secret');
  expect(snapshot).not.toContain('X-Amz-Credential');
  expect(snapshot).not.toContain('X-Goog-Signature');
  expect(snapshot).not.toContain('X-Amz-Signature');
  expect(snapshot).not.toContain('#frag');
  expect(snapshot).not.toContain('onload=');
}

it('sanitizes relative URL attributes in DOM snapshots', () => {
  addStandardUrlFixtureElements();
  addDataUrlFixtureElements();
  addDataSrcsetFixtureElements();
  addRemovedContentFixtureElements();

  const snapshot = buildDomSnapshotHtml();

  expectStandardUrlAttributesSanitized(snapshot);
  expectDataUrlAttributesSanitized(snapshot);
  expectDataSrcsetAttributesSanitized(snapshot);
  expectRemovedContentAttributesSanitized(snapshot);
});
