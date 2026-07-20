import { vi } from 'vitest';

type VisibleTargetFixture = {
  actionButton: Element;
};

function createComputedStyle(values: Record<string, string>): CSSStyleDeclaration {
  const styleValues: Record<string, string> = {
    display: 'block',
    opacity: '1',
    visibility: 'visible',
    ...values,
  };
  const propertyNames = Object.keys(styleValues);

  const style: Pick<
    CSSStyleDeclaration,
    'display' | 'opacity' | 'visibility' | 'getPropertyValue'
  > &
    Iterable<string> = {
    display: styleValues['display'] ?? 'block',
    opacity: styleValues['opacity'] ?? '1',
    visibility: styleValues['visibility'] ?? 'visible',
    getPropertyValue: (propertyName: string) => styleValues[propertyName] ?? '',
    *[Symbol.iterator]() {
      yield* propertyNames;
    },
  };

  return style as CSSStyleDeclaration;
}

function installComputedStyleFixture(
  entries: ReadonlyArray<readonly [Element, CSSStyleDeclaration]>
) {
  const styleMap = new WeakMap(entries);

  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    return (
      styleMap.get(element) ??
      createComputedStyle({
        display: 'none',
        opacity: '0',
        visibility: 'hidden',
      })
    );
  });
}

function setBoundingRect(
  element: Element,
  rect: {
    height: number;
    width: number;
    x?: number;
    y?: number;
  }
) {
  const x = rect.x ?? 0;
  const y = rect.y ?? 0;

  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: y + rect.height,
      height: rect.height,
      left: x,
      right: x + rect.width,
      top: y,
      width: rect.width,
      x,
      y,
      toJSON() {
        return this;
      },
    }),
  });
}

function installVisibleTargetMarkup() {
  const main = document.createElement('main');
  const section = document.createElement('section');
  const zeroBoxButton = document.createElement('button');
  const actionButton = document.createElement('button');
  const extensionRoot = document.createElement('div');
  const extensionButton = document.createElement('button');

  main.id = 'main-shell';
  zeroBoxButton.id = 'zero-box';
  zeroBoxButton.textContent = 'Ignored zero box';
  actionButton.id = 'user-jane@example.com';
  actionButton.className = 'cta primary extra';
  actionButton.textContent = '  Launch \n export  '.repeat(12);
  extensionRoot.id = 'sniptale-extension-root';
  extensionButton.id = 'extension-button';
  extensionButton.textContent = 'Extension only';

  section.append(zeroBoxButton, actionButton);
  main.append(section);
  extensionRoot.append(extensionButton);
  document.body.append(main, extensionRoot);
}

function getVisibleTargetFixtureElements() {
  const main = document.querySelector('main');
  const section = document.querySelector('section');
  const zeroBoxButton = document.getElementById('zero-box');
  const actionButton = document.querySelector('.cta');
  const extensionButton = document.getElementById('extension-button');

  if (!main || !section || !zeroBoxButton || !actionButton || !extensionButton) {
    throw new Error('Failed to install computed-style fixture');
  }

  return { actionButton, extensionButton, main, section, zeroBoxButton };
}

function installVisibleTargetLayout(elements: ReturnType<typeof getVisibleTargetFixtureElements>) {
  setBoundingRect(document.documentElement, { width: 1280, height: 720 });
  setBoundingRect(document.body, { width: 1280, height: 720 });
  setBoundingRect(elements.main, { x: 10, y: 12, width: 800, height: 400 });
  setBoundingRect(elements.section, { x: 10.1234, y: 40.5678, width: 799.555, height: 200.444 });
  setBoundingRect(elements.zeroBoxButton, { x: 20, y: 50, width: 0, height: 0 });
  setBoundingRect(elements.actionButton, { x: 1.2345, y: 6.7891, width: 199.995, height: 48.444 });
  setBoundingRect(elements.extensionButton, { x: 0, y: 0, width: 80, height: 24 });
}

export function installVisibleTargetFixture(): VisibleTargetFixture {
  installVisibleTargetMarkup();
  const elements = getVisibleTargetFixtureElements();

  installVisibleTargetLayout(elements);
  installComputedStyleFixture([
    [document.documentElement, createComputedStyle({ color: 'rgb(0, 0, 0)' })],
    [document.body, createComputedStyle({ color: 'rgb(0, 0, 0)' })],
    [elements.main, createComputedStyle({ color: 'rgb(1, 2, 3)' })],
    [elements.section, createComputedStyle({ color: 'rgb(4, 5, 6)' })],
    [
      elements.zeroBoxButton,
      createComputedStyle({
        color: 'rgb(7, 8, 9)',
        display: 'inline-flex',
      }),
    ],
    [
      elements.actionButton,
      createComputedStyle({
        color: 'rgb(255, 0, 0)',
        display: 'inline-flex',
      }),
    ],
    [elements.extensionButton, createComputedStyle({ display: 'inline-flex' })],
  ]);

  return {
    actionButton: elements.actionButton,
  };
}

export function installCappedTargetFixture() {
  const buttons = Array.from({ length: 30 }, (_, index) => {
    const button = document.createElement('button');
    button.textContent = `Action ${index + 1}`;
    document.body.append(button);
    return button;
  });

  setBoundingRect(document.documentElement, {
    x: Number.NaN,
    y: Number.POSITIVE_INFINITY,
    width: Number.POSITIVE_INFINITY,
    height: 10,
  });
  setBoundingRect(document.body, { width: 1280, height: 720 });

  buttons.forEach((button, index) => {
    setBoundingRect(button, {
      x: index,
      y: index + 1,
      width: 120,
      height: 24,
    });
  });

  installComputedStyleFixture([
    [document.documentElement, createComputedStyle({ color: 'rgb(0, 0, 0)' })],
    [document.body, createComputedStyle({ color: 'rgb(0, 0, 0)' })],
    ...buttons.map((button) => [button, createComputedStyle({ display: 'inline-flex' })] as const),
  ]);
}
