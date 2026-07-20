import React, { createContext, useContext } from 'react';
import type { ImageEditorController } from '../../controller';

const EditorControllerContext = createContext<ImageEditorController | null>(null);

export function EditorControllerProvider(props: {
  children: React.ReactNode;
  controller: ImageEditorController;
}) {
  return (
    <EditorControllerContext.Provider value={props.controller}>
      {props.children}
    </EditorControllerContext.Provider>
  );
}

export function useEditorController(): ImageEditorController {
  const controller = useContext(EditorControllerContext);
  if (!controller) {
    throw new Error('Editor controller context is not available');
  }

  return controller;
}

export function useOptionalEditorController(): ImageEditorController | null {
  return useContext(EditorControllerContext);
}
