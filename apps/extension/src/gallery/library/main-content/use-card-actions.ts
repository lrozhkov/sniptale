import { useLayoutEffect, useMemo, useRef } from 'react';
import type { GalleryItem } from '../items';
import type { GalleryMainContentProps } from './types';

type CardActions = Pick<
  GalleryMainContentProps,
  'onPreviewOpen' | 'onProjectOpen' | 'onRecordingGroupOpen' | 'onToggleSelection'
>;

/** Keeps card actions stable while dispatching through the latest committed render. */
export function useCardActions(props: CardActions): CardActions {
  const committed = useRef(props);
  useLayoutEffect(() => {
    committed.current = props;
  });
  const hasProject = Boolean(props.onProjectOpen);
  const hasGroup = Boolean(props.onRecordingGroupOpen);
  return useMemo(
    () => ({
      onPreviewOpen: (...args) => committed.current.onPreviewOpen(...args),
      onToggleSelection: (...args) => committed.current.onToggleSelection(...args),
      ...(hasProject
        ? { onProjectOpen: (item: GalleryItem) => committed.current.onProjectOpen?.(item) }
        : {}),
      ...(hasGroup
        ? {
            onRecordingGroupOpen: (item: GalleryItem) =>
              committed.current.onRecordingGroupOpen?.(item),
          }
        : {}),
    }),
    [hasProject, hasGroup]
  );
}
