// @vitest-environment jsdom

import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTemplatePointerDownHandler } from './pointer-down';
import type { TemplateDragRef } from './types';

const { getContentEventTargetElementMock } = vi.hoisted(() => ({
  getContentEventTargetElementMock: vi.fn(),
}));

vi.mock('../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/dom-host')>()),
  getContentEventTargetElement: getContentEventTargetElementMock,
}));

function createDragRef(value: TemplateDragRef['current']): TemplateDragRef {
  return { current: value };
}

function createPointerEvent(props: Partial<React.MouseEvent> = {}) {
  return {
    button: 0,
    clientX: 10,
    clientY: 20,
    nativeEvent: new MouseEvent('mousedown'),
    ...props,
  } as React.MouseEvent;
}

beforeEach(() => {
  getContentEventTargetElementMock.mockReset();
});

describe('createTemplatePointerDownHandler', () => {
  it('ignores non-left clicks and menu button targets', () => {
    const dragState = createDragRef(null);
    const menuButton = document.createElement('button');
    menuButton.dataset['menuBtn'] = 'true';
    getContentEventTargetElementMock.mockReturnValue(menuButton);
    const handlePointerDown = createTemplatePointerDownHandler(dragState);

    handlePointerDown(createPointerEvent({ button: 1 }), 'template-1');
    handlePointerDown(createPointerEvent(), 'template-1');

    expect(dragState.current).toBeNull();
  });

  it('stores drag coordinates for valid pointer-down events', () => {
    const dragState = createDragRef(null);
    getContentEventTargetElementMock.mockReturnValue(document.createElement('div'));

    createTemplatePointerDownHandler(dragState)(
      createPointerEvent({ clientX: 25, clientY: 40 }),
      'template-1'
    );

    expect(dragState.current).toEqual({
      id: 'template-1',
      moved: false,
      startX: 25,
      startY: 40,
    });
  });
});
