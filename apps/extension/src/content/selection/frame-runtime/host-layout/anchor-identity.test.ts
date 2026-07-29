// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { createAnchorFingerprint, resolveAnchorCandidate } from './anchor-identity';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('frame host-layout anchor identity', () => {
  it('refuses to select the first carousel clone when the locator is ambiguous', () => {
    const original = document.createElement('a');
    original.id = 'learn-more';
    original.href = '/products/service-desk';
    const clone = original.cloneNode(true) as HTMLAnchorElement;
    document.body.append(original, clone);

    const fingerprint = createAnchorFingerprint(original);
    const result = resolveAnchorCandidate('#learn-more', fingerprint);

    expect(result).toEqual({ kind: 'ambiguous' });
  });

  it('rejects multiple raw selector matches even when only one retains the fingerprint', () => {
    const original = document.createElement('a');
    original.id = 'learn-more';
    original.href = '/products/service-desk';
    original.setAttribute('aria-label', 'Learn more about Service Desk');
    document.body.appendChild(original);
    const fingerprint = createAnchorFingerprint(original);
    original.remove();

    const matching = original.cloneNode() as HTMLAnchorElement;
    const different = original.cloneNode() as HTMLAnchorElement;
    different.href = '/products/contact-center';
    document.body.append(matching, different);

    expect(resolveAnchorCandidate('#learn-more', fingerprint)).toEqual({ kind: 'ambiguous' });
  });

  it.each([
    ['a retained runtime fingerprint', true],
    ['cold history recovery', false],
  ])(
    'rejects fingerprint-identical clones hidden by a positional locator during %s',
    (_label, retainFingerprint) => {
      const carousel = document.createElement('section');
      carousel.id = 'carousel';
      const original = document.createElement('a');
      original.href = '/products/service-desk';
      original.setAttribute('aria-label', 'Learn more about Service Desk');
      carousel.appendChild(original);
      document.body.appendChild(carousel);
      const fingerprint = createAnchorFingerprint(original);
      original.remove();

      carousel.append(original.cloneNode(), original.cloneNode());

      expect(
        resolveAnchorCandidate(
          '#carousel > a:nth-of-type(1)',
          retainFingerprint ? fingerprint : null
        )
      ).toEqual({ kind: 'ambiguous' });
    }
  );

  it('reacquires a unique high-confidence replacement', () => {
    const original = document.createElement('a');
    original.href = '/products/service-desk';
    original.setAttribute('aria-label', 'Learn more about Service Desk');
    document.body.appendChild(original);
    const fingerprint = createAnchorFingerprint(original);
    original.remove();

    const replacement = document.createElement('a');
    replacement.href = '/products/service-desk';
    replacement.setAttribute('aria-label', 'Learn more about Service Desk');
    document.body.appendChild(replacement);

    expect(resolveAnchorCandidate('a[href="/products/service-desk"]', fingerprint)).toEqual({
      kind: 'resolved',
      element: replacement,
    });
  });

  it('resolves an immediate iframe selector from a nested same-origin parent document', () => {
    const outer = document.createElement('iframe');
    document.body.appendChild(outer);
    const outerDocument = outer.contentDocument!;
    const originalInner = outerDocument.createElement('iframe');
    originalInner.id = 'inner';
    outerDocument.body.appendChild(originalInner);
    const original = originalInner.contentDocument!.createElement('button');
    original.id = 'target';
    originalInner.contentDocument!.body.appendChild(original);
    const fingerprint = createAnchorFingerprint(original);
    originalInner.remove();

    const replacementInner = outerDocument.createElement('iframe');
    replacementInner.id = 'inner';
    outerDocument.body.appendChild(replacementInner);
    const replacement = replacementInner.contentDocument!.createElement('button');
    replacement.id = 'target';
    replacementInner.contentDocument!.body.appendChild(replacement);

    expect(resolveAnchorCandidate('iframe#inner => #target', fingerprint)).toEqual({
      kind: 'resolved',
      element: replacement,
    });
  });

  it('rejects a positional iframe match with an identical anchor in a sibling iframe', () => {
    const original = document.createElement('button');
    original.id = 'target';
    const fingerprint = createAnchorFingerprint(original);
    const first = document.createElement('iframe');
    const second = document.createElement('iframe');
    document.body.append(first, second);
    [first, second].forEach((iframe) => {
      const clone = iframe.contentDocument!.createElement('button');
      clone.id = 'target';
      iframe.contentDocument!.body.appendChild(clone);
    });

    expect(resolveAnchorCandidate('iframe:nth-of-type(1) => #target', fingerprint)).toEqual({
      kind: 'ambiguous',
    });
  });

  it.each([
    ['SVG', 'http://www.w3.org/2000/svg'],
    ['MathML', 'http://www.w3.org/1998/Math/MathML'],
  ])('rejects a selector match from the %s namespace', (_label, namespace) => {
    const original = document.createElement('a');
    original.id = 'learn-more';
    original.href = '/products/service-desk';
    original.setAttribute('aria-label', 'Learn more about Service Desk');
    document.body.appendChild(original);
    const fingerprint = createAnchorFingerprint(original);
    original.remove();

    const foreignCandidate = document.createElementNS(namespace, 'a');
    foreignCandidate.id = 'learn-more';
    foreignCandidate.setAttribute('href', '/products/service-desk');
    foreignCandidate.setAttribute('aria-label', 'Learn more about Service Desk');
    document.body.appendChild(foreignCandidate);

    expect(resolveAnchorCandidate('#learn-more', fingerprint)).toEqual({ kind: 'missing' });
  });
});
