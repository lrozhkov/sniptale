import authoritativeSchema from '../fixtures/sniptale-effect-v1.schema.json';

/**
 * The published SDK schema is kept as data so the extension validates against the exact
 * producer contract instead of rebuilding an equivalent-looking schema in executable code.
 */
export const EFFECT_V1_JSON_SCHEMA = Object.freeze(authoritativeSchema);
