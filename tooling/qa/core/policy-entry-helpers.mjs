import fs from 'node:fs';
import path from 'node:path';

function hasRequiredStringFields(entry, requiredFields) {
  return requiredFields.every(
    (field) => typeof entry?.[field] === 'string' && entry[field].length > 0
  );
}

export function collectPolicyEntryViolations(
  entries,
  {
    metadataRule,
    metadataMessage,
    missingTargetRule,
    missingTargetMessage,
    policyPath,
    requiredFields,
    rootDir,
  }
) {
  const violations = [];

  for (const entry of entries) {
    if (!hasRequiredStringFields(entry, requiredFields)) {
      violations.push({
        rule: metadataRule,
        file: policyPath,
        message: metadataMessage(entry),
      });
      continue;
    }

    if (!fs.existsSync(path.join(rootDir, entry.file))) {
      violations.push({
        rule: missingTargetRule,
        file: policyPath,
        message: missingTargetMessage(entry),
      });
    }
  }

  return violations;
}
