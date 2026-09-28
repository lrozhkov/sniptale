type EditorDocumentOpenToken = {
  readonly controller: object;
  readonly revision: number;
};

const controllerOpenRevisions = new WeakMap<object, number>();

export function beginEditorDocumentOpenOperation(controller: object): EditorDocumentOpenToken {
  const revision = (controllerOpenRevisions.get(controller) ?? 0) + 1;
  controllerOpenRevisions.set(controller, revision);
  return { controller, revision };
}

/** Captures document-open ownership without starting a new open operation. */
export function captureEditorDocumentOpenOperation(controller: object): EditorDocumentOpenToken {
  return { controller, revision: controllerOpenRevisions.get(controller) ?? 0 };
}

export function isCurrentEditorDocumentOpenOperation(token: EditorDocumentOpenToken): boolean {
  return (controllerOpenRevisions.get(token.controller) ?? 0) === token.revision;
}
