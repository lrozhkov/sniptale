import type { EditorDocumentActionCommands, EditorDocumentActionGroup } from '../types';

export function buildScenarioDocumentActionGroupList(
  commands: EditorDocumentActionCommands
): EditorDocumentActionGroup[] {
  return [
    { id: 'primary-save', items: [commands.saveImage, commands.saveImageAs], layout: 'stack' },
    { id: 'save-utilities', items: [commands.copyPng], layout: 'stack' },
    { id: 'image-format', items: [commands.imageFormat], layout: 'stack' },
  ];
}
