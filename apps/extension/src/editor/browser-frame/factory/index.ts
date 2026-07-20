import { BROWSER_HEADER_HEIGHT } from '../../document/model';
import { createBrowserFrameDecorationObjects } from './factory';
import type { BrowserFrameDecorationObjects, FrameOptions } from './types';

export class BrowserFrameFactory {
  static readonly HEADER_HEIGHT = BROWSER_HEADER_HEIGHT;

  static async createFrame(options: FrameOptions): Promise<BrowserFrameDecorationObjects> {
    return createBrowserFrameDecorationObjects(options);
  }
}

export type { BrowserFrameDecorationObjects, FrameOptions } from './types';
