import type { EditorDocumentActionCommands } from '../commands.types';
import type { EditorDocumentActionGroup } from '../types';

export function buildDocumentActionGroupList(
  commands: EditorDocumentActionCommands
): EditorDocumentActionGroup[] {
  return [
    {
      id: 'primary-save',
      items: [commands.saveImage],
      layout: 'stack',
    },
    {
      id: 'save-utilities',
      items: [commands.saveImageAs, commands.copyPng],
      layout: 'stack',
    },
    {
      id: 'quick-destinations',
      items: [commands.saveToFolder],
      layout: 'stack',
    },
    {
      id: 'image-format',
      items: [commands.imageFormat],
      layout: 'stack',
    },
    {
      id: 'session',
      items: [commands.exportSession, commands.importSession],
      layout: 'stack',
    },
    {
      id: 'open-image',
      items: [commands.openImage],
      layout: 'stack',
    },
    {
      id: 'close',
      items: [commands.closeFile],
      layout: 'stack',
    },
  ];
}
