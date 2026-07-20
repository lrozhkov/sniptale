import React from 'react';
import {
  PROJECT_AUDIO_ACCEPT_ATTRIBUTE,
  PROJECT_IMAGE_ACCEPT_ATTRIBUTE,
  PROJECT_VIDEO_ACCEPT_ATTRIBUTE,
} from '../project/operations/import-validation';

export interface VideoEditorFileInputRefs {
  audioInputRef: React.RefObject<HTMLInputElement | null>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  videoInputRef: React.RefObject<HTMLInputElement | null>;
}

interface VideoEditorFileImportHandlers {
  onImportAudio: (file: File) => void;
  onImportImage: (file: File) => void;
  onImportVideo: (file: File) => void;
}

interface VideoEditorFileInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  onImport: (file: File) => void;
}

function readSelectedFile(event: React.ChangeEvent<HTMLInputElement>): File | null {
  return event.target.files?.[0] ?? null;
}

function VideoEditorFileInput({ inputRef, accept, onImport }: VideoEditorFileInputProps) {
  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      hidden
      type="file"
      accept={accept}
      onChange={(event) => {
        const file = readSelectedFile(event);
        if (file) {
          onImport(file);
        }
        event.currentTarget.value = '';
      }}
    />
  );
}

export function VideoEditorFileInputNodes({
  imageInputRef,
  videoInputRef,
  audioInputRef,
  onImportImage,
  onImportVideo,
  onImportAudio,
}: VideoEditorFileInputRefs & VideoEditorFileImportHandlers) {
  return (
    <>
      <VideoEditorFileInput
        inputRef={imageInputRef}
        accept={PROJECT_IMAGE_ACCEPT_ATTRIBUTE}
        onImport={onImportImage}
      />
      <VideoEditorFileInput
        inputRef={videoInputRef}
        accept={PROJECT_VIDEO_ACCEPT_ATTRIBUTE}
        onImport={onImportVideo}
      />
      <VideoEditorFileInput
        inputRef={audioInputRef}
        accept={PROJECT_AUDIO_ACCEPT_ATTRIBUTE}
        onImport={onImportAudio}
      />
    </>
  );
}
