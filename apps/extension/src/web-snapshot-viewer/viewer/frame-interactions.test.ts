// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { installSnapshotFrameStaticInteractions } from './frame-interactions';

function createFrame(): { doc: Document; iframe: HTMLIFrameElement } {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  return { doc: iframe.contentDocument!, iframe };
}

function defineScrollGeometry(
  element: HTMLElement,
  values: { clientHeight: number; clientWidth: number; scrollHeight: number; scrollWidth: number }
): void {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, { configurable: true, value });
  }
}

it('scrolls a clipped horizontal list without enabling archived scripts', () => {
  const { doc, iframe } = createFrame();
  const list = doc.createElement('div');
  list.style.overflowX = 'hidden';
  const item = doc.createElement('span');
  list.append(item);
  doc.body.append(list);
  defineScrollGeometry(list, {
    clientHeight: 100,
    clientWidth: 300,
    scrollHeight: 100,
    scrollWidth: 900,
  });
  installSnapshotFrameStaticInteractions(iframe);

  const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 180 });
  item.dispatchEvent(wheel);

  expect(list.scrollLeft).toBe(180);
  expect(wheel.defaultPrevented).toBe(true);
});

it('projects an unambiguous hidden sibling as a reversible disclosure', () => {
  const { doc, iframe } = createFrame();
  const style = doc.createElement('style');
  style.textContent = '.hidden { visibility: hidden; }';
  doc.head.append(style);
  const owner = doc.createElement('section');
  const header = doc.createElement('div');
  const trigger = doc.createElement('span');
  trigger.className = 'chevron-down';
  trigger.style.cursor = 'pointer';
  trigger.textContent = 'Details';
  header.append(trigger);
  const spacer = doc.createElement('div');
  const region = doc.createElement('div');
  region.className = 'panel hidden';
  region.textContent = 'Retained static content';
  owner.append(header, spacer, region);
  doc.body.append(owner);
  const cleanup = installSnapshotFrameStaticInteractions(iframe);

  trigger.click();

  expect(region.classList.contains('hidden')).toBe(false);
  expect(trigger.classList.contains('chevron-up')).toBe(true);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');

  trigger.click();
  expect(region.className).toBe('panel hidden');
  expect(trigger.className).toBe('chevron-down');
  expect(trigger.hasAttribute('aria-expanded')).toBe(false);

  trigger.click();
  cleanup();
  expect(region.className).toBe('panel hidden');
  expect(trigger.className).toBe('chevron-down');
});

it('does not reinterpret links or ordinary pointer controls as disclosures', () => {
  const { doc, iframe } = createFrame();
  const owner = doc.createElement('section');
  const link = doc.createElement('a');
  link.href = '#local';
  link.style.cursor = 'pointer';
  link.textContent = 'Link';
  link.addEventListener('click', (event) => event.preventDefault());
  const region = doc.createElement('div');
  region.hidden = true;
  region.textContent = 'Hidden content';
  owner.append(link, region);
  doc.body.append(owner);
  installSnapshotFrameStaticInteractions(iframe);

  link.click();

  expect(region.hidden).toBe(true);
  expect(link.hasAttribute('aria-expanded')).toBe(false);
});
