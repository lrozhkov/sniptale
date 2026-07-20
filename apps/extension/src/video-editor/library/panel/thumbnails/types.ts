export interface LibraryThumbnailItem {
  createdAt: number;
  id: string;
  mimeType: string | null;
  sourceMediaId: string | null;
  thumbnailId: string;
}

export interface LibraryThumbnailViewState {
  status: 'ready';
  url: string;
}
