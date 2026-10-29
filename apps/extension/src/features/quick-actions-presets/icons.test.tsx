// @vitest-environment jsdom
import { act, createElement as createReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as createSvg } from 'lucide';
import * as originalIcons from 'lucide-react';
import { expect, it, vi } from 'vitest';
import {
  allowedQuickActionIcons,
  getQuickActionIconNode,
  getQuickActionReactIconNode,
} from './icons';

const originalNames = [
  'Camera',
  'Monitor',
  'MonitorDown',
  'Maximize',
  'Crop',
  'Scissors',
  'Zap',
  'Clock3',
  'Image',
  'PencilLine',
  'FileImage',
  'Clipboard',
  'ClipboardCopy',
  'Download',
  'Send',
  'Share2',
  'Focus',
  'Scan',
  'SquareDashedMousePointer',
  'Target',
  'Smartphone',
  'Tablet',
  'Laptop',
  'Eye',
  'Aperture',
  'Archive',
  'ArrowDownToLine',
  'ArrowUpRight',
  'Bookmark',
  'Box',
  'Check',
  'Circle',
  'CircleDot',
  'Code',
  'Copy',
  'Crosshair',
  'Disc',
  'File',
  'FileCode',
  'FileText',
  'Film',
  'Flag',
  'Folder',
  'Frame',
  'Grid2X2',
  'Heart',
  'ImagePlus',
  'Link',
  'List',
  'Map',
  'MousePointer',
  'Package',
  'Palette',
  'Play',
  'Plus',
  'Save',
  'Search',
  'Settings2',
  'Star',
  'Video',
] as const;

function geometry(svg: Element) {
  return [...svg.children].map((child) => ({
    tag: child.tagName.toLowerCase(),
    attrs: Object.fromEntries([...child.attributes].map(({ name, value }) => [name, value]).sort()),
  }));
}

it('preserves the original picker choices and their order', () => {
  expect(allowedQuickActionIcons).toEqual(originalNames);
});

it.each([...originalNames, 'Layers', 'Layout', 'Images'] as const)(
  'preserves %s artwork in both renderers',
  (name) => {
    const original = document.createElement('div');
    original.innerHTML = renderToStaticMarkup(createReactElement(originalIcons[name]));
    const glyph = getQuickActionIconNode(name);
    const native = createSvg(glyph);
    expect(geometry(native)).toEqual(geometry(original.querySelector('svg')!));
    const react = document.createElement('div');
    react.innerHTML = renderToStaticMarkup(
      createReactElement(originalIcons.Icon, { iconNode: getQuickActionReactIconNode(name) })
    );
    expect(geometry(react.querySelector('svg')!)).toEqual(geometry(native));
    expect(native.querySelector('script, image, use, foreignObject')).toBeNull();
    for (const element of [native, ...native.querySelectorAll('*')]) {
      for (const attribute of element.attributes) {
        expect(attribute.name).not.toMatch(/^(?:on|href|xlink:href)/u);
      }
    }
  }
);

it.each([undefined, '', 'Unknown', '__proto__', 'constructor', '<svg onload=alert(1)>'])(
  'falls back safely for %s',
  (name) => {
    expect(getQuickActionIconNode(name)).toBe(getQuickActionIconNode('Camera'));
  }
);

it('mounts and updates every quick-action glyph without React key warnings', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const errors = vi.spyOn(console, 'error');
  try {
    for (const name of [...originalNames, 'Layers', 'Layout', 'Images', 'Unknown', undefined]) {
      await act(async () => {
        root.render(
          createReactElement(originalIcons.Icon, { iconNode: getQuickActionReactIconNode(name) })
        );
      });
      expect(geometry(container.querySelector('svg')!)).toEqual(
        geometry(createSvg(getQuickActionIconNode(name)))
      );
    }
    expect(
      errors.mock.calls.filter(([message]) => String(message).includes('unique "key"'))
    ).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    errors.mockRestore();
  }
});
