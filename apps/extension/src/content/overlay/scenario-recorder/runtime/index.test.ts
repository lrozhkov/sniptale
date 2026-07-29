// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { isScenarioEligibleInteractionTarget } from '.';

afterEach(() => {
  document.body.replaceChildren();
});

describe('scenario-recorder target ownership', () => {
  it('keeps legacy marker recognition before content-root registration', () => {
    const target = document.createElement('div');
    target.className = 'sniptale-app';

    expect(isScenarioEligibleInteractionTarget(target)).toBe(false);
  });

  it('excludes exact shadow UI without excluding page or host-light-DOM lookalikes', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    initializeContentUiRoots(shadowRoot);
    const ownedTarget = document.createElement('button');
    ownedTarget.className = 'sniptale-app';
    shadowRoot.append(ownedTarget);
    const pageLookalike = ownedTarget.cloneNode() as HTMLElement;
    document.body.append(pageLookalike);
    const lightDomLookalike = ownedTarget.cloneNode() as HTMLElement;
    host.append(lightDomLookalike);

    expect(isScenarioEligibleInteractionTarget(ownedTarget)).toBe(false);
    expect(isScenarioEligibleInteractionTarget(pageLookalike)).toBe(true);
    expect(isScenarioEligibleInteractionTarget(lightDomLookalike)).toBe(true);
  });
});
