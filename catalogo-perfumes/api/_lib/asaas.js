export function getAsaasConfig() {
  const apiKey = process.env.ASAAS_API_KEY;
  const env = (process.env.ASAAS_ENV || 'sandbox').toLowerCase();

  if (!apiKey) throw new Error('ASAAS_API_KEY is not configured.');

  return {
    apiKey,
    env,
    baseUrl: env === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3',
  };
}

export async function asaasRequest(path, options = {}) {
  const { apiKey, baseUrl } = getAsaasConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      access_token: apiKey,
      'user-agent': 'DanImports/1.0',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const description = data?.errors?.map((e) => e.description).filter(Boolean).join(' | ');
    const err = new Error(description || `Asaas respondeu HTTP ${response.status}`);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}
