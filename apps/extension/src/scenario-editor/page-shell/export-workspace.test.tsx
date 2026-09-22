// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { GuideExportWorkspace } from './export-workspace';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('owns the two export regions, Escape close and initial back focus', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  try {
    await act(async () =>
      root.render(
        <GuideExportWorkspace
          className="tour-export"
          title="Export interactive tour"
          backLabel="Back to editing"
          headingMeta={<output>12 KB</output>}
          stageLabel="HTML preview"
          stage={<p data-testid="stage">stage</p>}
          inspector={<button title="Replay">Replay</button>}
          status={<p role="status">saved</p>}
          actions={<button title="Save HTML">Save HTML</button>}
          onClose={close}
        />
      )
    );
    const main = host.querySelector('main.guide-export-workspace.tour-export')!;
    expect(main.querySelector('.guide-page-header')).toBeNull();
    const stage = main.querySelector('.guide-export-stage')!;
    const inspector = main.querySelector('.guide-export-inspector')!;
    expect(stage.getAttribute('aria-label')).toBe('HTML preview');
    expect(stage.textContent).toBe('stage');
    expect(inspector.getAttribute('aria-label')).toBe('Export interactive tour');
    expect(inspector.textContent).toContain('Export interactive tour');
    expect(inspector.textContent).toContain('12 KB');
    expect(
      inspector.querySelector('.guide-export-inspector-body button[title="Replay"]')
    ).not.toBeNull();
    expect(
      inspector.querySelector('.guide-export-actions button[title="Save HTML"]')
    ).not.toBeNull();
    expect(inspector.querySelector('.guide-export-actions [role="status"]')?.textContent).toBe(
      'saved'
    );
    const back = inspector.querySelector<HTMLButtonElement>('button')!;
    expect(document.activeElement).toBe(back);
    await act(async () => back.click());
    expect(close).toHaveBeenCalledOnce();
    close.mockClear();
    await act(async () =>
      main.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    );
    expect(close).toHaveBeenCalledOnce();
    const prevented = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    prevented.preventDefault();
    await act(async () => main.dispatchEvent(prevented));
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
