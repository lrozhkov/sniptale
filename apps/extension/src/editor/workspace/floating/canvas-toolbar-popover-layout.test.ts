import { expect, it } from 'vitest';
import { resolveCanvasToolbarPopoverLayout } from './canvas-toolbar-popover-layout';
import type { FloatingToolbarGroup } from './canvas-toolbar-groups';

const group: FloatingToolbarGroup = {
  id: 'fill',
  kind: 'fill',
  title: 'Fill',
  trigger: 'F',
  content: 'Fill',
  width: 'style',
};

it('opens away from a toolbar above the selection when there is room', () => {
  const layout = resolveCanvasToolbarPopoverLayout({
    buttonRect: { bottom: 180, left: 320, top: 148, width: 36 },
    group,
    measuredHeight: 180,
    rootRect: { bottom: 340, left: 250, top: 300, width: 240 },
    toolbarPlacement: 'above-selection',
    viewportHeight: 900,
    viewportWidth: 1200,
  });

  expect(layout.placement).toBe('above');
  expect(layout.left).not.toBe(0);
});

it('opens away from a toolbar below the selection when there is room', () => {
  const layout = resolveCanvasToolbarPopoverLayout({
    buttonRect: { bottom: 430, left: 320, top: 398, width: 36 },
    group,
    measuredHeight: 180,
    rootRect: { bottom: 440, left: 250, top: 400, width: 240 },
    toolbarPlacement: 'below-selection',
    viewportHeight: 900,
    viewportWidth: 1200,
  });

  expect(layout.placement).toBe('below');
});

it('falls back toward the selection when the away side is constrained', () => {
  const layout = resolveCanvasToolbarPopoverLayout({
    buttonRect: { bottom: 92, left: 1120, top: 60, width: 36 },
    group: { ...group, width: 'menu' },
    measuredHeight: 220,
    rootRect: { bottom: 100, left: 40, top: 60, width: 240 },
    toolbarPlacement: 'above-selection',
    viewportHeight: 900,
    viewportWidth: 1200,
  });

  expect(layout.placement).toBe('below');
  expect(layout.left).toBeLessThan(900);
});
