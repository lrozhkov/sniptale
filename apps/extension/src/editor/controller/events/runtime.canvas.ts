import type { EditorControllerEventStateBindings } from './types';

export function createBeforeRenderHandler(
  bindings: Pick<EditorControllerEventStateBindings, 'getCanvas' | 'getDrawSession'>
) {
  let hadDraft = false;
  return (event: { ctx: CanvasRenderingContext2D }) => {
    const canvas = bindings.getCanvas();
    const contextTop = canvas?.contextTop;
    if (!canvas || !contextTop || event.ctx !== canvas.getContext()) {
      return;
    }

    const draft = bindings.getDrawSession()?.object;
    const hasDraft = Boolean(draft && !draft.visible);
    if (hasDraft) canvas.clearContext(contextTop);
    else if (hadDraft) contextTop.clearRect(0, 0, canvas.width, canvas.height);
    hadDraft = hasDraft;
  };
}
