import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const RETIRED_CONTROLS_POLICY = 'tooling/configs/qa/retired-controls.data.json';
export const RETIRED_CONTROLS_GUARD_ROOT = 'tooling/qa/core/retired-controls/';

export function readRetiredControlsPolicy(root = process.cwd()) {
  return JSON.parse(readFileSync(resolve(root, RETIRED_CONTROLS_POLICY), 'utf8'));
}
