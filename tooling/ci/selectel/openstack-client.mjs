import crypto from 'node:crypto';

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing Selectel controller value: ${label}.`);
  }
  return value;
}

function requireObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Malformed OpenStack response: ${label}.`);
  }
  return value;
}

function endpointUrl(catalog, type, region) {
  const services = catalog.filter((service) => service?.type === type);
  const endpoints = services.flatMap((service) =>
    Array.isArray(service.endpoints) ? service.endpoints : []
  );
  const matches = endpoints.filter(
    (endpoint) => endpoint?.interface === 'public' && endpoint.region === region
  );
  if (matches.length !== 1 || typeof matches[0].url !== 'string') {
    throw new Error(`Expected one public ${type} endpoint in configured region.`);
  }
  return matches[0].url.replace(/\/$/u, '');
}

async function parseJsonResponse(response, operation) {
  if (!response.ok) throw new Error(`OpenStack ${operation} failed with HTTP ${response.status}.`);
  try {
    return requireObject(await response.json(), operation);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Malformed OpenStack response:')) {
      throw error;
    }
    throw new Error(`OpenStack ${operation} returned malformed JSON.`, { cause: error });
  }
}

export async function authenticateOpenStack({
  env = process.env,
  expectedProjectSha256,
  expectedRegion,
  quotaManagerUrl,
  fetchImpl = fetch,
} = {}) {
  const authUrl = requireString(env.SELECTEL_OS_AUTH_URL, 'SELECTEL_OS_AUTH_URL').replace(
    /\/$/u,
    ''
  );
  const credentialId = requireString(
    env.SELECTEL_OS_APPLICATION_CREDENTIAL_ID,
    'SELECTEL_OS_APPLICATION_CREDENTIAL_ID'
  );
  const credentialSecret = requireString(
    env.SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET,
    'SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET'
  );
  const region = requireString(env.SELECTEL_OS_REGION_NAME, 'SELECTEL_OS_REGION_NAME');
  requireString(expectedProjectSha256, 'expected project SHA-256');
  requireString(expectedRegion, 'expected region');
  requireString(quotaManagerUrl, 'quota manager URL');
  if (region !== expectedRegion) throw new Error('OpenStack region does not match policy.');
  const response = await fetchImpl(`${authUrl}/auth/tokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      auth: {
        identity: {
          methods: ['application_credential'],
          application_credential: { id: credentialId, secret: credentialSecret },
        },
      },
    }),
  });
  const payload = await parseJsonResponse(response, 'authentication');
  const token = response.headers.get('x-subject-token');
  requireString(token, 'Keystone subject token');
  const tokenProjectId = payload.token?.project?.id;
  requireString(tokenProjectId, 'Keystone token project');
  const projectSha256 = crypto.createHash('sha256').update(tokenProjectId).digest('hex');
  if (projectSha256 !== expectedProjectSha256)
    throw new Error('OpenStack token project does not match policy.');
  if (!Array.isArray(payload.token?.catalog)) {
    throw new Error('Malformed OpenStack response: service catalog.');
  }
  return {
    projectId: tokenProjectId,
    projectFingerprint: `sha256:${projectSha256.slice(0, 12)}`,
    region,
    token,
    endpoints: {
      compute: endpointUrl(payload.token.catalog, 'compute', region),
      image: endpointUrl(payload.token.catalog, 'image', region),
      network: endpointUrl(payload.token.catalog, 'network', region),
      quotaManager: quotaManagerUrl.replace(/\/$/u, ''),
      volume: endpointUrl(payload.token.catalog, 'volumev3', region),
    },
  };
}

export async function openStackJson(session, service, requestPath, options = {}) {
  const endpoint = session.endpoints[service];
  if (typeof endpoint !== 'string') throw new Error(`Unknown OpenStack service: ${service}.`);
  const response = await (options.fetchImpl ?? fetch)(`${endpoint}${requestPath}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-auth-token': session.token,
      ...(service === 'compute' ? { 'openstack-api-version': 'compute 2.72' } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return parseJsonResponse(response, `${service} ${options.operation ?? 'request'}`);
}
