import { useEffect, useRef, useState } from 'react';
import { WatermarkInspector } from '../../../../../ui/watermark/inspector';
import {
  createQuickEditWatermark,
  parseQuickEditWatermark,
} from '../../../../../features/video/project/scene/watermark';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { translate } from '../../../../../platform/i18n';
import type { VideoEditorWatermarkInspectorRuntime } from '../../../../contracts/workspace';
import type { PreviewStageImportHandlers } from '../../../../contracts/insertion';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';
import { InspectorDetails } from '../shared/details';

/** Native lifetime, history and acquisition adapt the shared controlled inspector. */
export function SceneWatermarkFields(props: {
  project: VideoProject;
  runtime: VideoEditorWatermarkInspectorRuntime;
  onImportImage: PreviewStageImportHandlers['image'];
}) {
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const alive = useRef(false);
  const attempt = useRef<AbortController | null>(null);
  const gesture = useRef({});
  const token = gesture.current;
  const projectIdentity = useRef(props.project.id);
  projectIdentity.current = props.project.id;
  const { onPreview, registerAbort } = props.runtime;
  useEffect(() => {
    alive.current = true;
    const unregister = registerAbort(() => {
      gesture.current = {};
      attempt.current?.abort();
      attempt.current = null;
      onPreview(null);
      setPending(false);
      setError(null);
      setReset((value) => value + 1);
    });
    return () => {
      alive.current = false;
      attempt.current?.abort();
      attempt.current = null;
      unregister();
      onPreview(null);
    };
  }, [props.project.id, onPreview, registerAbort, reset]);
  const current = () =>
    alive.current && gesture.current === token && projectIdentity.current === props.project.id;
  const fail = () => {
    if (current()) setError(translate('common.errors.actionFailed'));
  };
  const accept = async (settings: NonNullable<VideoProject['watermark']>) => {
    const parsed = parseQuickEditWatermark(settings);
    if (!parsed || !current()) return false;
    let accepted = false;
    try {
      updateProject((project) => {
        if (
          !current() ||
          project.id !== props.project.id ||
          project.watermark !== props.project.watermark ||
          project.watermarkEnabled !== props.project.watermarkEnabled
        )
          return project;
        accepted = true;
        const previous =
          project.watermark ??
          createQuickEditWatermark(translate('gallery.videoReview.watermarkSeed'));
        const inactive = parsed.mode === 'none' && previous.mode !== 'none';
        const watermark = inactive ? { ...parsed, mode: previous.mode } : parsed;
        if (
          JSON.stringify(parseQuickEditWatermark(previous)) === JSON.stringify(watermark) &&
          inactive === (project.watermarkEnabled === false)
        )
          return project;
        const { watermarkEnabled: _disabled, ...active } = project;
        return { ...active, watermark, ...(inactive ? { watermarkEnabled: false as const } : {}) };
      });
    } catch {
      fail();
      return false;
    }
    if (accepted) setError(null);
    else fail();
    return accepted;
  };
  const image = async (file: File, originMediaId?: string, pickerSignal?: AbortSignal) => {
    if (!current() || attempt.current)
      throw new DOMException('Watermark acquisition was cancelled.', 'AbortError');
    const controller = new AbortController();
    const signal = pickerSignal
      ? AbortSignal.any([controller.signal, pickerSignal])
      : controller.signal;
    signal.throwIfAborted();
    attempt.current = controller;
    setPending(true);
    setError(null);
    try {
      await props.onImportImage(file, {
        destination: 'watermark',
        signal,
        ...(originMediaId ? { watermarkOriginMediaId: originMediaId } : {}),
      });
      signal.throwIfAborted();
      if (current()) onPreview(null);
    } catch (failure) {
      if (!signal.aborted && current())
        setError(translate('gallery.videoReview.watermarkImageFailed'));
      throw failure;
    } finally {
      const owned = attempt.current === controller;
      if (owned) attempt.current = null;
      if (owned && current()) setPending(false);
    }
  };
  return (
    <WatermarkInspector
      key={reset}
      Disclosure={InspectorDetails}
      dataUi="video-editor.watermark.inspector"
      settings={
        props.project.watermarkEnabled === false && props.project.watermark
          ? { ...props.project.watermark, mode: 'none' }
          : props.project.watermark
      }
      output={props.project}
      onChange={accept}
      onPreview={(settings) => {
        if (current()) onPreview(settings ? { project: props.project, settings } : null);
      }}
      onImage={image}
      pending={pending}
      error={error}
      onError={(message) => {
        if (current()) setError(message);
      }}
      imagePreviewUrl={props.runtime.imagePreviewUrl}
    />
  );
}
