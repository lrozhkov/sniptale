import { useEffect, type RefObject } from 'react';
import type { useEditorController } from '../../application/controller-context';

export function useCanvasMountEffect(props: {
  controller: ReturnType<typeof useEditorController>;
  viewportRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  useEffect(() => {
    if (!props.viewportRef.current || !props.stageRef.current || !props.canvasRef.current) {
      return;
    }

    props.controller.mount(
      props.canvasRef.current,
      props.viewportRef.current,
      props.stageRef.current
    );
    return () => props.controller.dispose();
  }, [props.canvasRef, props.controller, props.stageRef, props.viewportRef]);
}
