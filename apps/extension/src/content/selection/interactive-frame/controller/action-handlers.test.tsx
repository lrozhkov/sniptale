// @vitest-environment jsdom

import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { useInteractiveFrameActionHandlers } from './action-handlers';

const FRAME: FrameData = {
  effectMode: 'border',
  height: 120,
  id: 'frame-1',
  width: 200,
  x: 40,
  y: 60,
};

let container: HTMLDivElement;
let root: Root;
let latestSelectMode: ((mode: EffectMode) => void) | null = null;

function Harness(props: {
  onEffectChange: (frameId: string, mode: EffectMode) => void;
  onUpdate: (frame: FrameData) => void;
}) {
  const [effectMode, setEffectMode] = useState<EffectMode>('border');
  const [tempFrame, setTempFrame] = useState(FRAME);
  const [, setState] = useState<FrameState>('idle');
  const startFrameRef = useRef(FRAME);
  const startEffectModeRef = useRef<EffectMode>('border');
  latestSelectMode = useInteractiveFrameActionHandlers({
    closePopover: vi.fn(),
    effectMode,
    frame: FRAME,
    frameWithoutLinkedElement: FRAME,
    onDelete: vi.fn(),
    onEffectChange: props.onEffectChange,
    onUpdate: props.onUpdate,
    setEffectMode,
    setState,
    setTempFrame,
    startEffectModeRef,
    startFrameRef,
    tempFrame,
    togglePopover: vi.fn(),
  }).handleEffectModeSelect;
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  latestSelectMode = null;
  vi.unstubAllGlobals();
});

it('applies a menu mode selection live and ignores the already-selected mode', () => {
  const onEffectChange = vi.fn();
  const onUpdate = vi.fn();
  act(() => root.render(<Harness onEffectChange={onEffectChange} onUpdate={onUpdate} />));

  act(() => latestSelectMode?.('blur'));

  expect(onEffectChange).not.toHaveBeenCalled();
  expect(onUpdate).toHaveBeenCalledWith({ ...FRAME, effectMode: 'blur' });

  act(() => latestSelectMode?.('blur'));
  expect(onEffectChange).not.toHaveBeenCalled();
  expect(onUpdate).toHaveBeenCalledOnce();
});
