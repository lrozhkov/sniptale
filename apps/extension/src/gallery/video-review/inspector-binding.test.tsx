// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewOriginalSpeechPanel } from './speech-panel';
import type { ReviewSelectedProperties } from './selected-properties';
import { ReviewInspectorBinding } from './inspector-binding';

vi.mock('./inspector', () => ({
  ReviewInspector: (props: { speech: ReactNode; children: ReactNode }) => (
    <div>
      {props.speech}
      {props.children}
    </div>
  ),
}));
vi.mock('./speech-panel', () => ({
  ReviewOriginalSpeechPanel: (props: ComponentProps<typeof ReviewOriginalSpeechPanel>) => (
    <>
      <button onClick={() => void props.flushAdvanced()}>Flush source buffers</button>
      <button onClick={() => props.onJump?.(3)}>Seek source phrase</button>
    </>
  ),
}));
vi.mock('./selected-properties', () => ({
  reviewSelectionLabel: () => 'Voiceover',
  ReviewSelectedProperties: (props: ComponentProps<typeof ReviewSelectedProperties>) => (
    <>
      <button onClick={() => void props.flushAdvanced?.()}>Flush clip buffers</button>
      <button onClick={() => props.onSelectText?.('related')}>Open related text</button>
      <button onClick={() => props.onSelectText?.('missing')}>Open missing text</button>
    </>
  ),
  ReviewSelectedTextProperties: () => null,
}));

it('joins every editor buffer for either recognition source and guards related-text navigation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const order: string[] = [];
  const pause = vi.fn();
  const seek = vi.fn();
  const select = vi.fn();
  let allowed = false;
  const advanced = createQuickEditAdvancedState();
  const props = {
    resource: { filename: 'video', file: new Blob(), source: {}, session: {} },
    state: {
      actionSoundPreview: { audition: vi.fn(), stopAudition: vi.fn() },
      advanced,
      activeSelection: { kind: 'audio', id: 'clip', lane: 'voiceover' },
      selection: { kind: 'none' },
      projected: { markers: [] },
      snapshot: {
        snapshot: { workspace: { advanced, sourceAssetId: 'source' } },
        document: { annotations: [], edits: [] },
      },
      text: {
        document: { fragments: [{ id: 'related' }] },
        sourceInterval: () => ({ start: 9, end: 10 }),
      },
      timeline: { sceneOutputTime: 0, timeMap: { getSegments: () => [] } },
      composer: {
        flush: async () => {
          order.push('notes');
        },
      },
      flushAdvanced: async () => {
        order.push('advanced');
      },
      video: { current: { pause } },
      seek,
      setActiveSelection: select,
      beforeAction: (action: () => void) => {
        if (allowed) action();
      },
      editing: { exporter: { phase: 'idle', index: null } },
      zoom: {},
      features: {},
    },
    canvasComments: {
      flushTexts: async () => {
        order.push('canvas');
      },
    },
    audio: { assets: new Map() },
    navigation: {},
  } as unknown as ComponentProps<typeof ReviewInspectorBinding>;
  const click = (label: string) =>
    act(async () => {
      const button = Array.from(host.querySelectorAll('button')).find(
        (node) => node.textContent === label
      );
      if (!button) throw new Error('Missing fixture action');
      button.click();
    });
  try {
    await act(async () => root.render(<ReviewInspectorBinding {...props} />));
    await click('Flush source buffers');
    await click('Flush clip buffers');
    expect(order).toEqual(['notes', 'advanced', 'canvas', 'notes', 'advanced', 'canvas']);
    await click('Open related text');
    expect(select).not.toHaveBeenCalled();
    allowed = true;
    await click('Open missing text');
    expect(select).not.toHaveBeenCalled();
    await click('Open related text');
    expect(pause).toHaveBeenCalledOnce();
    expect(seek).toHaveBeenCalledWith(9, false);
    expect(select).toHaveBeenCalledWith({ kind: 'text', id: 'related' });
    await click('Seek source phrase');
    expect(seek).toHaveBeenLastCalledWith(3, false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
