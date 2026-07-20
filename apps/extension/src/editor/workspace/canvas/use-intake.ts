import type { Dispatch, DragEvent, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { useEditorController } from '../../application/controller-context';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { insertEditorImageFromFile, openEditorImageFromFile } from '../../document/file-actions';
import {
  getImageFileFromClipboardEvent,
  getImageFileFromDataTransfer,
  dataTransferMayContainFilePayload,
} from './intake';

type CanvasImageIntakeController = ReturnType<typeof useEditorController>;
type CanvasImageIntakeSource = 'drop' | 'paste' | 'upload';
type CanvasImageFileHandler = (source: CanvasImageIntakeSource, file: File) => void;

interface UseCanvasImageIntakeProps {
  controller: CanvasImageIntakeController;
  hasImage: boolean;
  openImageInputRef: RefObject<HTMLInputElement | null>;
  setImageData: (imageData: string | null) => void;
}

function claimImageIntakeEvent(event: DragEvent<HTMLDivElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function runImageFileAction(
  props: UseCanvasImageIntakeProps,
  source: CanvasImageIntakeSource,
  file: File
) {
  if (props.hasImage) {
    fireAndReportEditorAction(`canvas-insert-image-${source}`, () =>
      insertEditorImageFromFile(props.controller, file)
    );
    return;
  }

  fireAndReportEditorAction(`canvas-open-image-${source}`, () =>
    openEditorImageFromFile(props.controller, file, props.setImageData)
  );
}

function useImagePasteListener(
  hasImage: boolean,
  handleImageFile: (source: 'paste', file: File) => void
) {
  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const file = getImageFileFromClipboardEvent(event);
      if (file) {
        event.preventDefault();
        handleImageFile('paste', file);
      }
    }

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleImageFile, hasImage]);
}

function useCanvasImageFileHandler(props: UseCanvasImageIntakeProps): CanvasImageFileHandler {
  return useCallback(
    (source: CanvasImageIntakeSource, file: File) => runImageFileAction(props, source, file),
    [props]
  );
}

function isInternalDragLeave(event: DragEvent<HTMLDivElement>) {
  return event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
}

function handleImageDrop(
  event: DragEvent<HTMLDivElement>,
  handleImageFile: CanvasImageFileHandler
): boolean {
  const mayContainFile = dataTransferMayContainFilePayload(event.dataTransfer);
  const file = getImageFileFromDataTransfer(event.dataTransfer);
  if (!file) {
    if (mayContainFile) {
      claimImageIntakeEvent(event);
    }
    return false;
  }

  claimImageIntakeEvent(event);
  handleImageFile('drop', file);
  return true;
}

function useCanvasDragHandlers(args: {
  handleImageFile: CanvasImageFileHandler;
  hasImage: boolean;
  setDragActive: Dispatch<SetStateAction<boolean>>;
}) {
  const onDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!dataTransferMayContainFilePayload(event.dataTransfer)) {
        return;
      }

      claimImageIntakeEvent(event);
      args.setDragActive(!args.hasImage);
    },
    [args]
  );

  const onDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!dataTransferMayContainFilePayload(event.dataTransfer)) {
        return;
      }

      if (isInternalDragLeave(event)) {
        return;
      }

      args.setDragActive(false);
    },
    [args]
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const accepted = handleImageDrop(event, args.handleImageFile);
      args.setDragActive(false);
      void accepted;
    },
    [args]
  );

  return { onDragLeave, onDragOver, onDrop };
}

export function useCanvasImageIntake(props: UseCanvasImageIntakeProps) {
  const [dragActive, setDragActive] = useState(false);
  const handleImageFile = useCanvasImageFileHandler(props);
  const dragHandlers = useCanvasDragHandlers({
    handleImageFile,
    hasImage: props.hasImage,
    setDragActive,
  });

  useEffect(() => {
    if (props.hasImage) {
      setDragActive(false);
    }
  }, [props.hasImage]);
  useImagePasteListener(props.hasImage, handleImageFile);

  return {
    dragActive,
    ...dragHandlers,
    onOpenImage: () => props.openImageInputRef.current?.click(),
    openImageFile: (file: File | undefined) => {
      if (file) {
        handleImageFile('upload', file);
      }
    },
  };
}
