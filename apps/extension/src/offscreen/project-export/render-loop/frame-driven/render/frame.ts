import type { RenderFrameDrivenCompositeFrameArgs } from './types';
import { encodeFrameDrivenCompositeFrame } from './encode';
import { prepareFrameDrivenCompositeFrame } from './prepare';

export async function renderFrameDrivenCompositeFrame(
  args: RenderFrameDrivenCompositeFrameArgs
): Promise<void> {
  await prepareFrameDrivenCompositeFrame(args);
  await encodeFrameDrivenCompositeFrame(args);
}
