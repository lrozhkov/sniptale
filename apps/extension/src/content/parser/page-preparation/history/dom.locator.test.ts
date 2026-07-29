// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { captureDomStateMap, createDomMutationBatch } from './dom';
import { clearHistoryDomLocators, HistoryLocatorAllocationError } from './dom-locators';

afterEach(() => {
  clearHistoryDomLocators();
  document.body.replaceChildren();
});

describe('page-preparation history locator allocation', () => {
  it('fails capture when the page disconnects the target during locator assignment', () => {
    const elementName = 'history-disconnecting-target';
    if (!customElements.get(elementName)) {
      customElements.define(
        elementName,
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

    const target = document.createElement(elementName);
    target.setAttribute('data-sniptale-id', 'page-owned-id');
    document.body.append(target);

    expect(() => captureDomStateMap([target])).toThrow(HistoryLocatorAllocationError);
    expect(target.isConnected).toBe(false);
    expect(target.getAttribute('data-sniptale-id')).toBe('page-owned-id');
  });

  it('bounds retries when the page duplicates every assigned history identity', () => {
    const elementName = 'history-duplicating-target';
    if (!customElements.get(elementName)) {
      customElements.define(
        elementName,
        class extends HTMLElement {
          static observedAttributes = ['data-sniptale-id'];

          attributeChangedCallback(name: string, _oldValue: string | null, value: string | null) {
            if (name !== 'data-sniptale-id' || !value?.startsWith('history-')) {
              return;
            }

            const decoy = this.ownerDocument.createElement('div');
            decoy.setAttribute('data-sniptale-id', value);
            this.ownerDocument.body.prepend(decoy);
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

  it('fails after a bounded dense collision range and restores the page identity', () => {
    const probe = document.createElement('div');
    document.body.append(probe);
    captureDomStateMap([probe]);
    const probeId = probe.getAttribute('data-sniptale-id');
    const currentSequence = Number.parseInt(probeId?.replace('history-', '') ?? '', 10);
    if (!Number.isFinite(currentSequence)) {
      throw new Error('Expected a numeric history locator');
    }
    clearHistoryDomLocators();
    probe.remove();

    for (let offset = 1; offset <= 32; offset += 1) {
      const decoy = document.createElement('div');
      decoy.setAttribute('data-sniptale-id', `history-${currentSequence + offset}`);
      document.body.append(decoy);
    }
    const target = document.createElement('div');
    target.setAttribute('data-sniptale-id', 'page-owned-id');
    document.body.append(target);

    expect(() => captureDomStateMap([target])).toThrow(HistoryLocatorAllocationError);
    expect(target.getAttribute('data-sniptale-id')).toBe('page-owned-id');
  });

  it('rolls back identities allocated earlier in a failed multi-target capture', () => {
    const elementName = 'history-late-disconnecting-target';
    if (!customElements.get(elementName)) {
      customElements.define(
        elementName,
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

    const first = document.createElement('div');
    first.setAttribute('data-sniptale-id', 'page-first');
    const second = document.createElement(elementName);
    second.setAttribute('data-sniptale-id', 'page-second');
    document.body.append(first, second);

    expect(() => captureDomStateMap([first, second])).toThrow(HistoryLocatorAllocationError);
    expect(first.getAttribute('data-sniptale-id')).toBe('page-first');
    expect(second.getAttribute('data-sniptale-id')).toBe('page-second');
  });

  it('fails closed when a captured identity becomes duplicate before batch creation', () => {
    const target = document.createElement('div');
    target.setAttribute('data-sniptale-id', 'page-source');
    document.body.append(target);
    const beforeStates = captureDomStateMap([target]);
    const ownedId = target.getAttribute('data-sniptale-id');
    if (!ownedId) {
      throw new Error('Expected an owned history identity');
    }
    const decoy = document.createElement('div');
    decoy.setAttribute('data-sniptale-id', ownedId);
    document.body.prepend(decoy);

    expect(() => createDomMutationBatch([target], beforeStates)).toThrow(
      HistoryLocatorAllocationError
    );
    expect(target.getAttribute('data-sniptale-id')).toBe('page-source');
    expect(decoy.getAttribute('data-sniptale-id')).toBe(ownedId);
  });

  it('does not reallocate when the page changes a captured identity before batch creation', () => {
    const target = document.createElement('div');
    target.setAttribute('data-sniptale-id', 'page-source');
    document.body.append(target);
    const beforeStates = captureDomStateMap([target]);
    target.setAttribute('data-sniptale-id', 'page-replacement');

    expect(() => createDomMutationBatch([target], beforeStates)).toThrow(
      HistoryLocatorAllocationError
    );
    expect(target.getAttribute('data-sniptale-id')).toBe('page-replacement');
  });
});
