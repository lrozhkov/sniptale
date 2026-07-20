import { isAuditObject, parseRequiredAuditJson } from '../result-contract.mjs';

function describeCycloneDxSchema(value) {
  if (
    !isAuditObject(value) ||
    value.bomFormat !== 'CycloneDX' ||
    typeof value.specVersion !== 'string' ||
    value.specVersion.length === 0 ||
    !Array.isArray(value.components)
  ) {
    return 'root requires CycloneDX bomFormat, specVersion, and components';
  }
  for (const [index, component] of value.components.entries()) {
    if (
      !isAuditObject(component) ||
      typeof component.type !== 'string' ||
      component.type.length === 0 ||
      typeof component.name !== 'string' ||
      component.name.length === 0
    ) {
      return `component ${index} requires type and name`;
    }
  }
  return null;
}

export function parseLicenseSbom(stdout, commandResult = null) {
  return parseRequiredAuditJson(stdout, {
    commandResult,
    describeSchema: describeCycloneDxSchema,
    source: 'stdout',
    tool: 'npm license SBOM',
  });
}
