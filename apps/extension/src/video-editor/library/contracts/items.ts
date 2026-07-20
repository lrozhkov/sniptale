export interface RecordingListItem {
  createdAt: number;
  duration: number | null;
  filename: string;
  height: number | null;
  id: string;
  mimeType: string;
  size: number;
  thumbnailId: string;
  width: number | null;
}

export interface ProjectListItem {
  clipCount: number;
  createdAt: number;
  duration: number;
  height: number;
  id: string;
  name: string;
  thumbnailId: string;
  thumbnailSourceMediaId: string | null;
  trackCount: number;
  updatedAt: number;
  width: number;
}
