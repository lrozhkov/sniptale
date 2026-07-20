export interface ContextMenuDescriptor {
  id: string;
  parentId?: string;
  title?: string;
  type?: chrome.contextMenus.CreateProperties['type'];
}
