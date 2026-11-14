// @vitest-environment jsdom
import { fixture, setupElements, state } from './fixture.test-support';
import { act } from 'react';
import { expect, it } from 'vitest';
import { useElementsPlacement } from './placement-view';
const ui = setupElements();
let placement: ReturnType<typeof useElementsPlacement>;
function Placement() {
  placement = useElementsPlacement();
  return (
    <div role="status">
      {placement.inserting ? 'inserting' : placement.error ? 'error' : 'ready'}
    </div>
  );
}
it('records successful use and exposes recoverable insertion refusal and failure', async () => {
  await ui.render(<Placement />);
  const entry = state().entries[0]!;
  await act(async () => placement.add(entry));
  expect(fixture.api.used).toHaveBeenCalledWith(entry.definition);
  fixture.controller.insertVectorElement.mockResolvedValueOnce(false);
  await act(async () => placement.add(entry));
  expect(ui.host().textContent).toBe('error');
  act(() => placement.clearError());
  expect(ui.host().textContent).toBe('ready');
  fixture.controller.insertVectorElement.mockRejectedValueOnce(new Error('Insert failed'));
  await act(async () => placement.add(entry));
  expect(ui.host().textContent).toBe('error');
  expect(fixture.api.used).toHaveBeenCalledOnce();
});
it('blocks unresolved and duplicate insertions while a supported insertion is pending', async () => {
  await ui.render(<Placement />);
  const entry = state().entries[0]!;
  await act(async () => placement.add({ ...entry, definition: null }));
  expect(fixture.controller.insertVectorElement).not.toHaveBeenCalled();
  let resolve!: (accepted: boolean) => void;
  fixture.controller.insertVectorElement.mockImplementationOnce(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      })
  );
  let pending!: Promise<void>;
  act(() => {
    pending = placement.add(entry);
  });
  expect(ui.host().textContent).toBe('inserting');
  await act(async () => placement.add(entry));
  expect(fixture.controller.insertVectorElement).toHaveBeenCalledOnce();
  await act(async () => {
    resolve(true);
    await pending;
  });
  expect(ui.host().textContent).toBe('ready');
});
it('does not show a refusal from a document that was replaced during insertion', async () => {
  await ui.render(<Placement />);
  let resolve!: (accepted: boolean) => void;
  fixture.controller.insertVectorElement.mockImplementationOnce(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      })
  );
  let pending!: Promise<void>;
  act(() => {
    pending = placement.add(state().entries[0]!);
  });
  fixture.controller.source = {};
  await act(async () => {
    resolve(false);
    await pending;
  });
  expect(ui.host().textContent).toBe('ready');
  expect(fixture.api.used).not.toHaveBeenCalled();
});
it('finishes a rejected insertion safely after the panel is closed', async () => {
  await ui.render(<Placement />);
  let reject!: (error: Error) => void;
  fixture.controller.insertVectorElement.mockImplementationOnce(
    () =>
      new Promise<boolean>((_done, fail) => {
        reject = fail;
      })
  );
  let pending!: Promise<void>;
  act(() => {
    pending = placement.add(state().entries[0]!);
  });
  await ui.render(null);
  await act(async () => {
    reject(new Error('Panel closed'));
    await pending;
  });
  expect(fixture.api.used).not.toHaveBeenCalled();
});
