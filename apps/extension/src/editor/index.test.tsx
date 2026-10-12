// @vitest-environment jsdom
import { isValidElement } from 'react';
import { expect, it, vi } from 'vitest';
import { EditorResourceAdmission } from '../composition/editor-resource-admission';
const render = vi.hoisted(() =>
  vi.fn<(options: { element: unknown; namespace: string }) => null>(() => null)
);
vi.mock('../ui/page-bootstrap', () => ({ renderPageShell: render }));
vi.mock('./shell/page', () => ({ EditorPage: () => null }));
vi.mock('@sniptale/platform/observability/message-tracer', () => ({ initTracer: vi.fn() }));

it('mounts standalone and embedded Image through resource admission', async () => {
  await import('./index');
  expect(render).toHaveBeenCalledOnce();
  const options = render.mock.calls[0]![0];
  expect(options.namespace).toBe('EditorEntrypoint');
  if (!isValidElement(options.element)) throw new Error('Image entrypoint did not render');
  expect(options.element.type).toBe(EditorResourceAdmission);
});
