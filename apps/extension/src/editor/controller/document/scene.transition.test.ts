import { expect, it } from 'vitest';

import {
  shouldFitSourceForBrowserTransition,
  shouldPreserveCanvasForBrowserTransition,
} from './scene';

function createFrame() {
  return {
    backgroundColor: '#fff',
    backgroundGradientAngle: 0,
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#000',
    backgroundImageData: null,
    backgroundImageFit: 'cover',
    backgroundMode: 'color',
    browserMode: false,
    browserTitle: '',
    browserUrl: '',
    layoutMode: 'expand-canvas',
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
  };
}

function createBrowserFrame() {
  return {
    canvasMode: 'resize-canvas',
    contentMode: 'push-down',
    enabled: false,
    title: '',
    url: '',
  };
}

it('preserves the canvas when the frame already uses fit-image layout', () => {
  expect(
    shouldPreserveCanvasForBrowserTransition(
      {
        ...createFrame(),
        layoutMode: 'fit-image',
      } as never,
      createBrowserFrame() as never,
      {
        ...createBrowserFrame(),
        enabled: true,
      } as never
    )
  ).toBe(true);
});

it('preserves the canvas when either browser draft keeps the current size', () => {
  expect(
    shouldPreserveCanvasForBrowserTransition(
      createFrame() as never,
      {
        ...createBrowserFrame(),
        canvasMode: 'keep-size',
      } as never,
      createBrowserFrame() as never
    )
  ).toBe(true);
  expect(
    shouldPreserveCanvasForBrowserTransition(
      createFrame() as never,
      createBrowserFrame() as never,
      {
        ...createBrowserFrame(),
        canvasMode: 'keep-size',
      } as never
    )
  ).toBe(true);
});

it('does not preserve the canvas when neither layout nor browser draft asks for it', () => {
  expect(
    shouldPreserveCanvasForBrowserTransition(
      createFrame() as never,
      createBrowserFrame() as never,
      createBrowserFrame() as never
    )
  ).toBe(false);
});

it('fits the source when the frame already uses fit-image layout', () => {
  expect(
    shouldFitSourceForBrowserTransition(
      {
        ...createFrame(),
        layoutMode: 'fit-image',
      } as never,
      createBrowserFrame() as never,
      createBrowserFrame() as never
    )
  ).toBe(true);
});

it('fits the source when either browser draft requests fit-content', () => {
  expect(
    shouldFitSourceForBrowserTransition(
      createFrame() as never,
      {
        ...createBrowserFrame(),
        contentMode: 'fit-content',
      } as never,
      createBrowserFrame() as never
    )
  ).toBe(true);
  expect(
    shouldFitSourceForBrowserTransition(
      createFrame() as never,
      createBrowserFrame() as never,
      {
        ...createBrowserFrame(),
        contentMode: 'fit-content',
      } as never
    )
  ).toBe(true);
});

it('does not fit the source when neither layout nor browser draft asks for it', () => {
  expect(
    shouldFitSourceForBrowserTransition(
      createFrame() as never,
      createBrowserFrame() as never,
      createBrowserFrame() as never
    )
  ).toBe(false);
});
