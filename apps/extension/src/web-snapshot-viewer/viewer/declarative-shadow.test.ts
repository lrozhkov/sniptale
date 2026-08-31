// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { hydrateSnapshotDeclarativeShadowDom } from './declarative-shadow';

it('hydrates retained declarative shadow boundaries without executing snapshot code', () => {
  const target = document.implementation.createHTMLDocument('snapshot');
  const outerHost = target.createElement('snapshot-outer');
  const outerBoundary = target.createElement('template');
  outerBoundary.setAttribute('shadowrootmode', 'open');
  const innerHost = target.createElement('snapshot-inner');
  const innerBoundary = target.createElement('template');
  innerBoundary.setAttribute('shadowrootmode', 'open');
  innerBoundary.content.append(target.createElement('strong'));
  innerHost.append(innerBoundary);
  outerBoundary.content.append(innerHost);
  outerHost.append(outerBoundary);
  target.body.append(outerHost);

  hydrateSnapshotDeclarativeShadowDom(target);

  const innerShadow = outerHost.shadowRoot?.querySelector('snapshot-inner')?.shadowRoot;
  expect(innerShadow).not.toBeNull();
  expect(innerShadow?.querySelector('strong')).not.toBeNull();
  expect(target.querySelector('template[shadowrootmode]')).toBeNull();
  expect(target.querySelector('script')).toBeNull();
});
