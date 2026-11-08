export type NodeEnv = 'development' | 'production' | 'test';

export type ServerConfig = {
  port: number;
  nodeEnv: NodeEnv;
  jwtSecret: string;
  corsOrigin: string[];
};

function normalizeCorsOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const issues: string[] = [];
  const portValue = env.PORT ?? '3000';
  const rawPort = Number.parseInt(portValue, 10);

  if (!portValue || Number.isNaN(rawPort) || rawPort <= 0 || !Number.isInteger(rawPort)) {
    issues.push('PORT must be a positive integer');
  }

  const jwtSecret = env.JWT_SECRET ?? '';
  if (!jwtSecret.trim()) {
    issues.push('JWT_SECRET is required');
  }

  const clientOrigin = env.CLIENT_ORIGIN ?? '';
  if (!clientOrigin.trim()) {
    issues.push('CLIENT_ORIGIN is required');
  }

  const nodeEnv = (env.NODE_ENV ?? 'development') as NodeEnv;

  if (nodeEnv === 'production' && ['change-me', 'dev-secret', 'super-secret'].includes(jwtSecret.trim())) {
    issues.push('JWT_SECRET must not use the default production value');
  }

  if (issues.length > 0) {
    throw new Error(`Invalid configuration:\n- ${issues.join('\n- ')}`);
  }

  return {
    port: rawPort,
    nodeEnv,
    jwtSecret,
    corsOrigin: normalizeCorsOrigins(clientOrigin),
  };
}
