// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { createBrowserAnnotationTargetEvidence } from './evidence';

afterEach(() => {
  document.body.replaceChildren();
});

it('captures stable top-document evidence without transient Sniptale identity', () => {
  const parent = document.createElement('main');
  parent.className = 'layout sniptale-transient';
  const target = document.createElement('p');
  target.id = 'target';
  target.className = 'copy sniptale-overlay emphasized';
  target.setAttribute('role', 'note');
  target.textContent = '  Visible   annotation text  ';
  parent.append(target);
  document.body.append(parent);

  const evidence = createBrowserAnnotationTargetEvidence(target);

  expect(evidence).toMatchObject({
    fileLabel: 'browser:Visible annotation text',
    frame: { kind: 'top-document' },
    targetRole: 'note',
    targetText: 'Visible   annotation text',
  });
  expect(evidence.targetSelector).toContain('#target');
  expect(evidence.targetSelector).not.toContain('data-sniptale-id');
  expect(evidence.targetPath).toContain('p#target.copy.emphasized');
  expect(evidence.targetPath).not.toContain('sniptale-');
});

it('captures the inner target and iframe context only for an accessible iframe document', () => {
  const iframe = document.createElement('iframe');
  iframe.id = 'same-origin-frame';
  iframe.name = 'Editor frame';
  document.body.append(iframe);
  const target = iframe.contentDocument!.createElement('div');
  iframe.contentDocument!.body.append(target);

  const evidence = createBrowserAnnotationTargetEvidence(target);

  expect(evidence.fileLabel).toBe('browser:div');
  expect(evidence.frame).toMatchObject({
    kind: 'iframe',
    name: 'Editor frame',
    selector: 'iframe#same-origin-frame',
  });
  expect(evidence).not.toHaveProperty('targetRole');
});

it('captures full root-scoped selector and ancestor evidence for an open shadow target', () => {
  const host = document.createElement('article');
  host.id = 'card-host';
  const root = host.attachShadow({ mode: 'open' });
  const wrapper = document.createElement('section');
  const target = document.createElement('button');
  target.className = 'primary';
  wrapper.append(target);
  root.append(wrapper);
  document.body.append(host);

  const evidence = createBrowserAnnotationTargetEvidence(target);

  expect(evidence.targetSelector).toBe('#card-host >>> button.primary');
  expect(evidence.targetPath).toContain('article#card-host >>> section > button.primary');
});
