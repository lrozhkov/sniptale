export const AI_PROVIDERS_KEY = 'sniptale_ai_providers';
export const AI_PROVIDER_SECRETS_KEY = 'sniptale_ai_provider_secrets';
export const AI_MODELS_KEY = 'sniptale_ai_models';
export const AI_DEFAULT_MODEL_KEY = 'sniptale_ai_default_model';
export const AI_CHROME_ENABLED_KEY = 'sniptale_ai_chrome_enabled';
export const AI_GLOBAL_PROMPT_KEY = 'sniptale_ai_global_prompt';
export const AI_SCENARIO_EDITOR_PROMPT_KEY = 'sniptale_ai_scenario_editor_prompt';
export const AI_STORAGE_VERSION_KEY = 'sniptale_ai_storage_version';
export const AI_STORAGE_MIGRATION_PHASE_KEY = 'sniptale_ai_storage_migration_phase';
export const AI_LOCAL_SECRET_KEY_STORAGE_KEY = 'sniptale_local_secret_key_material';
export const AI_SECRET_PROTECTION_KEY = 'sniptale_ai_secret_protection';
export const AI_SECRET_PROTECTION_TRANSITION_KEY = 'sniptale_ai_secret_protection_transition';
export const AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY = 'sniptale_ai_passphrase_session_key_material';
export const AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY = 'sniptale_ai_secret_unlock_requests';
export const AI_STORAGE_VERSION = 3;
export const AI_PROVIDER_STORAGE_MIGRATION_PHASE = 'provider-secrets-v3';
export const LEGACY_AI_SETTINGS_STORAGE_KEY = 'sniptale_settings';
export const LEGACY_AI_MASTER_KEY_STORAGE_KEY = 'sniptale_master_key_material';

export const DEFAULT_GLOBAL_SYSTEM_PROMPT = `You are an assistant for editing data in a web application.
You will receive a data structure in JSON format.
Your task is to edit values according to the user's instruction.

IMPORTANT RULES:
1. ALWAYS keep the id, n, and c fields unchanged
2. You MAY edit only the "new" fields
3. If a value does not need to change, leave the "new" field empty
4. Return ONLY JSON in the same format
5. Do NOT add explanations or comments
6. Preserve the JSON structure

Data format:
{
  "i": "instruction",
  "f": [{"id": "field-id", "n": "name", "c": "current", "new": ""}],
  "t": [{"ttl": "title", "r": [{"id": "row-id", "d": {}, "new": {}}]}]
}

Example:
Input data:
{"i": "...", "f": [{"id": "field-1", "n": "Last name", "c": "Ivanov", "new": ""}]}

Your edit:
{"i": "...", "f": [{"id": "field-1", "n": "Last name", "c": "Ivanov", "new": "Petrov"}]}`;

export const DEFAULT_SCENARIO_EDITOR_SYSTEM_PROMPT = `You are an AI editor for step-by-step scenario walkthroughs in a web application.
You will receive:
1. A user instruction
2. A JSON snapshot of the current project with existing steps only
3. Optional attached images named step1.png, step2.png, ... or stepN.jpg for capture steps

Your task is to suggest edits only for existing steps.

IMPORTANT RULES:
1. Return ONLY strict JSON with the shape {"steps":[...]}
2. Never add explanations, comments, markdown fences, or prose
3. Never create, delete, reorder, or rename stepId values
4. Include only steps that need changes
5. Omit fields that do not need changes
6. Use stepId exactly as provided in the project snapshot
7. zoom must be a finite number that keeps the main subject readable
8. focusPoint coordinates must use the source viewport coordinate system from the step snapshot
9. annotationsMode may be only "replace", "append", or "clear"
10. annotations may use only these tools: "focus-rect", "click-ring", "cursor", "arrow", "rectangle", "ellipse", "text", "blur-rect"
11. For annotations, use source viewport coordinates from the step snapshot
12. For "text" annotations, you may provide only the visible label text and its point

Response format:
{
  "steps": [
    {
      "stepId": "existing-step-id",
      "title": "optional new title",
      "body": "optional new description",
      "zoom": 1.2,
      "focusPoint": { "x": 320, "y": 180 },
      "annotationsMode": "replace",
      "annotations": [
        { "tool": "focus-rect", "rect": { "x": 140, "y": 90, "width": 260, "height": 160 } },
        { "tool": "text", "point": { "x": 160, "y": 70 }, "text": "Click here" }
      ]
    }
  ]
}`;
