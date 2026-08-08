import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

import { requiredManifestPermissionDisclosures } from './required-disclosures';

function readManifest() {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'apps/extension/manifest.json'), 'utf8')
  ) as {
    content_scripts?: Array<{ all_frames?: boolean; matches?: string[] }>;
    host_permissions?: string[];
    permissions?: string[];
  };
}

function readManifestPermissionPolicy() {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'tooling/configs/qa/manifest-permissions.data.json'),
      'utf8'
    )
  ) as {
    contentScripts?: Array<{ name: string; userFacingDisclosure: string }>;
    hostPermissions?: Array<{ name: string; userFacingDisclosure: string }>;
    permissions?: Array<{ name: string; userFacingDisclosure: string }>;
  };
}

function getExpectedDisclosureIds() {
  const manifest = readManifest();
  return [
    ...(manifest.permissions ?? []),
    ...(manifest.host_permissions ?? []),
    ...((manifest.content_scripts ?? []).some((contentScript) => contentScript.all_frames === true)
      ? ['contentScriptAllFrames']
      : []),
  ].sort();
}

function getPolicyDisclosureByGrantId() {
  const policy = readManifestPermissionPolicy();
  const entries = [
    ...(policy.permissions ?? []),
    ...(policy.hostPermissions ?? []),
    ...(policy.contentScripts ?? []).map((entry) => ({
      ...entry,
      name: 'contentScriptAllFrames',
    })),
  ];

  return new Map(entries.map((entry) => [entry.name, entry.userFacingDisclosure]));
}

it('covers every required manifest permission, host grant, and all-frame content script', () => {
  const disclosureIds = requiredManifestPermissionDisclosures
    .map((disclosure) => disclosure.id)
    .sort();

  expect(disclosureIds).toEqual(getExpectedDisclosureIds());
});

it('keeps product disclosure copy aligned with manifest permission policy metadata', () => {
  const policyDisclosureByGrantId = getPolicyDisclosureByGrantId();

  for (const disclosure of requiredManifestPermissionDisclosures) {
    expect(policyDisclosureByGrantId.get(disclosure.id)).toBe(disclosure.descriptionKey);
  }

  expect([...policyDisclosureByGrantId.keys()].sort()).toEqual(
    requiredManifestPermissionDisclosures.map((disclosure) => disclosure.id).sort()
  );
});
