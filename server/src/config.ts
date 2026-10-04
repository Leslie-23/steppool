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
  /** Resend (HTTPS email API). Preferred: Render's free plan blocks SMTP, so Gmail/nodemailer can't connect there. */
  resendKey: env.RESEND_API_KEY || undefined,
  /** Sender address. Resend's shared onboarding@resend.dev only delivers to your own account email until a domain is verified. */
  mailFrom: env.MAIL_FROM ?? 'StepPool <onboarding@resend.dev>',
  /** Gmail account + app password (SMTP fallback, e.g. local development). */
  mailUser: env.MAIL_USER || undefined,
  mailPass: env.MAIL_APP_PASSWORD?.replace(/\s+/g, '') || undefined,
  /** App Store / Play review account: this email signs in with a fixed code and is never emailed. */
  reviewEmail: env.REVIEW_EMAIL?.trim().toLowerCase() || undefined,
  reviewCode: env.REVIEW_CODE?.trim() || undefined,
  /** Emails that become admins when they sign in. */
  adminEmails: (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  /** Sign in with Apple: identity-token audiences (the iOS bundle id). */
  appleAudiences: (env.APPLE_AUDIENCES ?? 'com.steppool.app').split(',').map((s) => s.trim()).filter(Boolean),
  /** Google OAuth client ids (iOS, Android, web) whose ID tokens we accept. */
  googleClientIds: (env.GOOGLE_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** Return OTP codes in the API response. Never in production. */
  otpInResponse: env.NODE_ENV !== 'production',
  extraTrustedSources: (env.EXTRA_TRUSTED_SOURCES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  appleTeamId: env.APPLE_TEAM_ID,
  androidFingerprints: (env.ANDROID_SHA256_FINGERPRINTS ?? '').split(',').filter(Boolean),
  /** Run BullMQ jobs inside the API process (free plan has no background workers). */
  jobsInProcess: env.JOBS_IN_PROCESS === 'true',
  /** Feature flag: real-money entry. Stays off until legal review. */
  paidEntryEnabled: env.PAID_ENTRY_ENABLED === 'true',
  /** Emails that get real-money challenges while the flag is off, for testing with Paystack test keys. */
  paidEntryTesters: (env.PAID_ENTRY_TESTERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  /** Paystack secret key (sk_test_… or sk_live_…). Also verifies webhook signatures. */
  paystackSecret: env.PAYSTACK_SECRET_KEY || undefined,
};

/** Real-money challenges: everyone once the flag is on, testers before that. */
export const cashEnabledFor = (email: string) => config.paidEntryEnabled || config.paidEntryTesters.includes(email.toLowerCase());
