// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { captureDomStateMap } from './dom';
import { clearHistoryDomLocators, HistoryLocatorAllocationError } from './dom-locators';

afterEach(() => {
  clearHistoryDomLocators();
  document.body.replaceChildren();
});

describe('page-preparation history locator reentrancy', () => {
  it('preserves a page rewrite and stops after the first lost-ownership attempt', () => {
    const elementName = 'history-rewriting-target';
    let rewriteCount = 0;
    if (!customElements.get(elementName)) {
      customElements.define(
        elementName,
        class extends HTMLElement {
          static observedAttributes = ['data-sniptale-id'];

          attributeChangedCallback(name: string, _oldValue: string | null, value: string | null) {
            if (name === 'data-sniptale-id' && value?.startsWith('history-')) {
              rewriteCount += 1;
              this.setAttribute('data-sniptale-id', `page-rewrite-${value}`);
            }
          }
        }
      );
    }

    const target = document.createElement(elementName);
    target.setAttribute('data-sniptale-id', 'page-owned-id');
    document.body.append(target);

    expect(() => captureDomStateMap([target])).toThrow(HistoryLocatorAllocationError);
    expect(rewriteCount).toBe(1);
    expect(target.getAttribute('data-sniptale-id')).toMatch(/^page-rewrite-history-/);
  });

  it('blocks one-shot same-element capture reentry before installing ownership', () => {
    const elementName = 'history-one-shot-reentrant-target';
    let reentryFailure: unknown;
    if (!customElements.get(elementName)) {
      customElements.define(
        elementName,
        class extends HTMLElement {
          static observedAttributes = ['data-sniptale-id'];

          attributeChangedCallback(name: string, _oldValue: string | null, value: string | null) {
            if (name !== 'data-sniptale-id' || !value?.startsWith('history-')) {
              return;
            }

            try {
              captureDomStateMap([this]);
            } catch (error) {
              reentryFailure = error;
            }
          }
        }
      );
    }

    const target = document.createElement(elementName);
    target.setAttribute('data-sniptale-id', 'page-owned-id');
    document.body.append(target);

    expect(captureDomStateMap([target]).size).toBe(1);
    expect(reentryFailure).toBeInstanceOf(HistoryLocatorAllocationError);
    clearHistoryDomLocators();
    expect(target.getAttribute('data-sniptale-id')).toBe('page-owned-id');
  });

  it('bounds repeated same-element capture reentry to guarded failures', () => {
    const elementName = 'history-repeated-reentrant-target';
    const reentryFailures: unknown[] = [];
    if (!customElements.get(elementName)) {
      customElements.define(
        elementName,
        class extends HTMLElement {
          static observedAttributes = ['data-sniptale-id'];

          attributeChangedCallback(name: string, _oldValue: string | null, value: string | null) {
            if (name !== 'data-sniptale-id' || !value?.startsWith('history-')) {
              return;
            }

            for (let attempt = 0; attempt < 5; attempt += 1) {
              try {
                captureDomStateMap([this]);
              } catch (error) {
                reentryFailures.push(error);
              }
            }
          }
        }
      );
    }

    const target = document.createElement(elementName);
    document.body.append(target);

    expect(captureDomStateMap([target]).size).toBe(1);
    expect(reentryFailures).toHaveLength(5);
    reentryFailures.forEach((error) => {
      expect(error).toBeInstanceOf(HistoryLocatorAllocationError);
    });
  });

  it('does not install a binding after reentrant history cleanup changes the generation', () => {
    const elementName = 'history-clearing-reentrant-target';
    if (!customElements.get(elementName)) {
      customElements.define(
        elementName,
        class extends HTMLElement {
          static observedAttributes = ['data-sniptale-id'];

          attributeChangedCallback(name: string, _oldValue: string | null, value: string | null) {
            if (name === 'data-sniptale-id' && value?.startsWith('history-')) {
              clearHistoryDomLocators();
            }
          }
        }
      );
    }

    const target = document.createElement(elementName);
    target.setAttribute('data-sniptale-id', 'page-owned-id');
    document.body.append(target);

    expect(() => captureDomStateMap([target])).toThrow(HistoryLocatorAllocationError);
    expect(target.getAttribute('data-sniptale-id')).toBe('page-owned-id');
  });
});
