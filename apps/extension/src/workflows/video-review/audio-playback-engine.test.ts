// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createReviewAudioEngine } from './audio-playback-engine';

class Node {
  gain = { value: 1 };
  connect = vi.fn();
  disconnect = vi.fn();
}
const contexts: Context[] = [];
class Context {
  currentTime = 0;
  destination = new Node();
  original = new Node();
  gains: Node[] = [];
  close = vi.fn(async () => undefined);
  resume = vi.fn(async () => undefined);
  constructor() {
    contexts.push(this);
  }
  createMediaElementSource() {
    return this.original;
  }
  createGain() {
    const node = new Node();
    this.gains.push(node);
    return node;
  }
}
afterEach(() => {
  contexts.length = 0;
  vi.unstubAllGlobals();
});

it('keeps the output bus independent of original gain and disposes both stages once', () => {
  vi.stubGlobal('AudioContext', Context);
  const engine = createReviewAudioEngine(document.createElement('video'));
  if (!engine) throw new Error('Missing engine');
  const context = contexts[0]!;
  const [original, output] = context.gains;
  expect(original?.connect).toHaveBeenCalledWith(context.destination);
  expect(output?.connect).toHaveBeenCalledWith(context.destination);
  expect(output?.gain.value).toBe(1);
  engine.setOriginalGain(2);
  engine.setOutputGain(0.25);
  expect(original?.gain.value).toBe(2);
  expect(output?.gain.value).toBe(0.25);
  engine.setOutputGain(0);
  expect(original?.gain.value).toBe(2);
  engine.dispose();
  engine.dispose();
  expect(original?.disconnect).toHaveBeenCalledOnce();
  expect(output?.disconnect).toHaveBeenCalledOnce();
  expect(context.original.disconnect).toHaveBeenCalledOnce();
  expect(context.close).toHaveBeenCalledOnce();
});
