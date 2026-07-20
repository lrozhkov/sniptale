import { describe, expect, it } from 'vitest';
import * as exportManager from './index';
import * as files from './files';

describe('export-manager facade', () => {
  it('exposes only the owned file resource operations', () => {
    expect(Object.keys(exportManager).sort()).toEqual([
      'collectDirectLinks',
      'collectDynamicLinks',
      'collectFroalaImageResources',
      'downloadFileResources',
    ]);
    expect(exportManager.collectDirectLinks).toBe(files.collectDirectLinks);
    expect(exportManager.collectDynamicLinks).toBe(files.collectDynamicLinks);
    expect(exportManager.collectFroalaImageResources).toBe(files.collectFroalaImageResources);
    expect(exportManager.downloadFileResources).toBe(files.downloadFileResources);
  });
});
