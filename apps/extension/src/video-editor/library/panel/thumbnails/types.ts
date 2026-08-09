export interface LibraryThumbnailItem {
  createdAt: number;
  id: string;
  mimeType: string | null;
  sourceMediaId: string | null;
  thumbnailId: string;
  workspaceRevision?: number;
}

export interface LibraryThumbnailViewState {
  status: 'ready';
  url: string;
}
