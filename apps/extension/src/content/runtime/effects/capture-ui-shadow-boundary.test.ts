// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { createNavigationLocker } from '../../selection/locker/runtime';

const runtimeEffectsStylesheet = readFileSync(
  resolve(process.cwd(), 'apps/extension/src/content/public/preparation-surface/effects.css'),
  'utf8'
);

afterEach(() => {
  document.body.classList.remove('sniptale-capture-ui-hidden');
  document.body.replaceChildren();
});

it('bridges live capture visibility from the capture owner into the rendered shadow boundary', () => {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  document.body.append(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = runtimeEffectsStylesheet;
  const transientHandle = document.createElement('button');
  transientHandle.className = 'sniptale-callout-tail-handle';
  const capturedCallout = document.createElement('div');
  capturedCallout.className = 'sniptale-callout';
  shadowRoot.append(style, transientHandle, capturedCallout);

  const locker = createNavigationLocker();
  locker.setUIHidden(true);

  expect(document.body.classList.contains('sniptale-capture-ui-hidden')).toBe(true);
  expect(host.classList.contains('sniptale-capture-ui-hidden')).toBe(true);
  expect(transientHandle.getRootNode()).toBe(shadowRoot);
  expect(style.textContent).toContain(
    ':host(.sniptale-capture-ui-hidden) .sniptale-callout-tail-handle'
  );
  expect(style.textContent).not.toContain(':host(.sniptale-capture-ui-hidden) .sniptale-callout {');

  locker.setUIHidden(false);
  expect(host.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
});
