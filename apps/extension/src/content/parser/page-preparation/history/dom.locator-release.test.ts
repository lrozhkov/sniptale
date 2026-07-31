// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { captureDomStateMap } from './dom';
import { clearHistoryDomLocators, HistoryLocatorAllocationError } from './dom-locators';

afterEach(() => {
  clearHistoryDomLocators();
  document.body.replaceChildren();
});

describe('page-preparation history locator release', () => {
  it('denies capture of another element during clear restoration', () => {
    const elementName = 'history-clear-releasing-target';
    let reentryFailure: unknown;
    let reentryTarget: HTMLElement | null = null;
    if (!customElements.get(elementName)) {
      customElements.define(
        elementName,
        class extends HTMLElement {
          static observedAttributes = ['data-sniptale-id'];

          attributeChangedCallback(name: string, oldValue: string | null, _value: string | null) {
            if (
              name !== 'data-sniptale-id' ||
              !oldValue?.startsWith('history-') ||
              !reentryTarget
            ) {
              return;
            }

            try {
              captureDomStateMap([reentryTarget]);
            } catch (error) {
              reentryFailure = error;
            }
          }
        }
      );
    }

    const source = document.createElement(elementName);
    source.setAttribute('data-sniptale-id', 'page-source');
    reentryTarget = document.createElement('div');
    document.body.append(source, reentryTarget);
    captureDomStateMap([source]);

    clearHistoryDomLocators();

    expect(reentryFailure).toBeInstanceOf(HistoryLocatorAllocationError);
    expect(reentryTarget.getAttribute('data-sniptale-id')).toBeNull();
    expect(captureDomStateMap([reentryTarget]).size).toBe(1);
  });

  it('denies capture of another element during failed-operation rollback', () => {
    const releasingName = 'history-rollback-releasing-target';
    const failingName = 'history-rollback-failing-target';
    let reentryFailure: unknown;
    let reentryTarget: HTMLElement | null = null;
    if (!customElements.get(releasingName)) {
      customElements.define(
        releasingName,
        class extends HTMLElement {
          static observedAttributes = ['data-sniptale-id'];

          attributeChangedCallback(name: string, oldValue: string | null, _value: string | null) {
            if (
              name !== 'data-sniptale-id' ||
              !oldValue?.startsWith('history-') ||
              !reentryTarget
            ) {
              return;
            }

            try {
              captureDomStateMap([reentryTarget]);
            } catch (error) {
              reentryFailure = error;
            }
          }
        }
      );
    }
    if (!customElements.get(failingName)) {
      customElements.define(
        failingName,
        class extends HTMLElement {
          static observedAttributes = ['data-sniptale-id'];

          attributeChangedCallback(name: string, _oldValue: string | null, value: string | null) {
            if (name === 'data-sniptale-id' && value?.startsWith('history-')) {
              this.remove();
            }
          }
        }
      );
    }

    const source = document.createElement(releasingName);
    source.setAttribute('data-sniptale-id', 'page-source');
    const failing = document.createElement(failingName);
    failing.setAttribute('data-sniptale-id', 'page-failing');
    reentryTarget = document.createElement('div');
    document.body.append(source, failing, reentryTarget);

    expect(() => captureDomStateMap([source, failing])).toThrow(HistoryLocatorAllocationError);
    expect(reentryFailure).toBeInstanceOf(HistoryLocatorAllocationError);
    expect(source.getAttribute('data-sniptale-id')).toBe('page-source');
    expect(reentryTarget.getAttribute('data-sniptale-id')).toBeNull();
    expect(captureDomStateMap([reentryTarget]).size).toBe(1);
  });
});
