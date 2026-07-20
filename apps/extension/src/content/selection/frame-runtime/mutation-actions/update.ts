import type { FrameData } from '../../../../features/highlighter/contracts';
import { resolveUpdatedFrame } from './update-resolver';

type FrameSetter = React.Dispatch<React.SetStateAction<FrameData[]>>;

export function createUpdateFrameHandler({
  setFrames,
  linkedElementsRef,
}: {
  setFrames: FrameSetter;
  linkedElementsRef: React.MutableRefObject<Map<string, HTMLElement>>;
}) {
  return (frameId: string, newFrame: FrameData) => {
    const linkedElement = linkedElementsRef.current.get(frameId);

    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== frameId) {
          return frame;
        }

        return resolveUpdatedFrame({
          frame,
          frameId,
          newFrame,
          ...(linkedElement === undefined ? {} : { linkedElement }),
        });
      })
    );
  };
}
