import type {
  PreviewStageImportHandlers,
  VideoEditorImportDispatchResult,
  VideoEditorImportKind,
} from '../../contracts/insertion';

function resolveImportKind(file: File): VideoEditorImportKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

export function dispatchVideoEditorMediaImport(
  handlers: PreviewStageImportHandlers,
  file: File,
  onUnsupported: () => void
): VideoEditorImportDispatchResult {
  const kind = resolveImportKind(file);
  if (!kind) {
    onUnsupported();
    return { status: 'unsupported', reason: 'unsupported-media-type' };
  }

  void handlers[kind](file);
  return { status: 'dispatched', kind };
}
