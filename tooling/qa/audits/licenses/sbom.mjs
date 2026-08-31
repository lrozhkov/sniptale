import { isAuditObject, parseRequiredAuditJson } from '../contracts/result-contract.mjs';

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
    if (
      component.version !== undefined &&
      (typeof component.version !== 'string' || component.version.length === 0)
    ) {
      return `component ${index} version must be a non-empty string when present`;
    }
    if (
      component.purl !== undefined &&
      (typeof component.purl !== 'string' || component.purl.length === 0)
    ) {
      return `component ${index} purl must be a non-empty string when present`;
    }
    if (
      component.properties !== undefined &&
      (!Array.isArray(component.properties) ||
        !component.properties.every(
          (property) =>
            isAuditObject(property) &&
            typeof property.name === 'string' &&
            property.name.length > 0 &&
            typeof property.value === 'string'
        ))
    ) {
      return `component ${index} properties must contain string name/value pairs`;
    }
    if (component.licenses !== undefined && !Array.isArray(component.licenses)) {
      return `component ${index} licenses must be an array when present`;
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
