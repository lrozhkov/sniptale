import { useEffect, useRef, useState } from 'react';
import { exportEffectInstance } from '../../features/video/project/effect-instance/export';
import type { VideoProject } from '../../features/video/project/types';
import { translate } from '../../platform/i18n';

/** Owns one editor-local download and releases its URL with the mounted consumer. */
export function useEffectInstanceExport(project: VideoProject, instanceId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const lifetime = useRef<{ url: string | null; active: boolean }>({ url: null, active: true });
  useEffect(() => {
    const owner = { url: null as string | null, active: true };
    lifetime.current = owner;
    return () => {
      owner.active = false;
      if (owner.url) URL.revokeObjectURL(owner.url);
    };
  }, [instanceId]);
  return {
    busy,
    error,
    export: async () => {
      if (pending.current) return;
      const owner = lifetime.current;
      pending.current = true;
      setBusy(true);
      setError(null);
      try {
        const artifact = await exportEffectInstance(project, instanceId);
        if (!owner.active) return;
        if (owner.url) URL.revokeObjectURL(owner.url);
        owner.url = URL.createObjectURL(artifact.blob);
        const link = document.createElement('a');
        link.href = owner.url;
        link.download = artifact.filename;
        link.click();
      } catch {
        if (owner.active) setError(translate('videoEditor.effectsLibrary.exportFailed'));
      } finally {
        pending.current = false;
        if (owner.active) setBusy(false);
      }
    },
  };
}
