import { expect, it } from 'vitest';
import { resolveCurtainListPosition } from './curtain-position';

function elementStub(props: {
  clientHeight?: number;
  height?: number;
  offsetHeight?: number;
  offsetTop?: number;
  scrollHeight?: number;
  top?: number;
}) {
  return {
    clientHeight: props.clientHeight ?? props.height ?? 0,
    offsetHeight: props.offsetHeight ?? props.height ?? 0,
    offsetTop: props.offsetTop ?? 0,
    scrollHeight: props.scrollHeight ?? props.height ?? 0,
    getBoundingClientRect: () => ({
      bottom: (props.top ?? 0) + (props.height ?? 0),
      height: props.height ?? 0,
      left: 0,
      right: 0,
      top: props.top ?? 0,
      width: 0,
      x: 0,
      y: props.top ?? 0,
      toJSON: () => ({}),
    }),
  };
}

it('uses top space before scrolling when a long list overflows below the trigger', () => {
  const position = resolveCurtainListPosition({
    activeOption: elementStub({ height: 28, offsetTop: 0 }) as HTMLButtonElement,
    anchorClientY: null,
    firstOption: elementStub({ height: 28, offsetTop: 0 }) as HTMLButtonElement,
    list: elementStub({ height: 700, scrollHeight: 700 }) as HTMLDivElement,
    panel: elementStub({ clientHeight: 400, height: 400, top: 0 }) as HTMLDivElement,
    trigger: elementStub({ height: 40, top: 340 }) as HTMLDivElement,
  });

  expect(position).toEqual({ paddingTop: 346, scrollTop: 0 });
});

it('limits padding for short lists that fit inside the panel', () => {
  const position = resolveCurtainListPosition({
    activeOption: elementStub({ height: 28, offsetTop: 0 }) as HTMLButtonElement,
    anchorClientY: null,
    firstOption: elementStub({ height: 28, offsetTop: 0 }) as HTMLButtonElement,
    list: elementStub({ height: 80, scrollHeight: 80 }) as HTMLDivElement,
    panel: elementStub({ clientHeight: 400, height: 400, top: 0 }) as HTMLDivElement,
    trigger: elementStub({ height: 40, top: 340 }) as HTMLDivElement,
  });

  expect(position).toEqual({ paddingTop: 320, scrollTop: 0 });
});

it('scrolls down to align active options that start below the trigger', () => {
  const position = resolveCurtainListPosition({
    activeOption: elementStub({ height: 28, offsetTop: 300 }) as HTMLButtonElement,
    anchorClientY: 120,
    firstOption: elementStub({ height: 28, offsetTop: 0 }) as HTMLButtonElement,
    list: elementStub({ height: 700, scrollHeight: 700 }) as HTMLDivElement,
    panel: elementStub({ clientHeight: 400, height: 400, top: 0 }) as HTMLDivElement,
    trigger: elementStub({ height: 40, top: 100 }) as HTMLDivElement,
  });

  expect(position).toEqual({ paddingTop: 0, scrollTop: 194 });
});
