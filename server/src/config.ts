const env = process.env;

function required(name: string, devDefault: string) {
  const v = env[name];
  if (v) return v;
  if (env.NODE_ENV === 'production') throw new Error(`Missing env ${name}`);
  return devDefault;
}

export const config = {
  port: Number(env.PORT ?? 4000),
  production: env.NODE_ENV === 'production',
  mongoUrl: required('MONGO_URL', 'mongodb://127.0.0.1:27017/steppool?replicaSet=rs0'),
  redisUrl: required('REDIS_URL', 'redis://127.0.0.1:6379'),
  jwtSecret: required('JWT_SECRET', 'dev-secret'),
  adminKey: required('ADMIN_API_KEY', 'dev-admin'),
  publicUrl: env.PUBLIC_URL ?? 'http://localhost:4000',
  arkeselKey: env.ARKESEL_API_KEY || undefined,
  smsSender: env.SMS_SENDER ?? 'StepPool',
  /** Return OTP codes in the API response. Never in production. */
  otpInResponse: env.NODE_ENV !== 'production',
  extraTrustedSources: (env.EXTRA_TRUSTED_SOURCES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  appleTeamId: env.APPLE_TEAM_ID,
  androidFingerprints: (env.ANDROID_SHA256_FINGERPRINTS ?? '').split(',').filter(Boolean),
  /** Feature flag: real-money entry. Stays off until legal review. */
  paidEntryEnabled: env.PAID_ENTRY_ENABLED === 'true',
};
