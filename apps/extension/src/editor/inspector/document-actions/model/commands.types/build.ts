import type { EditorDocumentActionCommand } from './command';
import type { EditorDocumentActionContent } from './content';

export interface EditorDocumentActionCommands {
  closeFile: EditorDocumentActionCommand;
  copyPng: EditorDocumentActionCommand;
  imageFormat: EditorDocumentActionContent;
  exportSession: EditorDocumentActionCommand;
  importSession: EditorDocumentActionCommand;
  openImage: EditorDocumentActionCommand;
  saveImage: EditorDocumentActionCommand;
  saveImageAs: EditorDocumentActionCommand;
  saveToFolder: EditorDocumentActionContent;
}

export type EditorDocumentActionCommandBuilders = Pick<
  EditorDocumentActionCommands,
  | 'closeFile'
  | 'copyPng'
  | 'exportSession'
  | 'importSession'
  | 'openImage'
  | 'saveImage'
  | 'saveImageAs'
>;

export type EditorDocumentActionContentBuilders = Pick<
  EditorDocumentActionCommands,
  'imageFormat' | 'saveToFolder'
>;
