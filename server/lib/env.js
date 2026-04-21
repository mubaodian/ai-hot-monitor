import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ENV_FILE = path.resolve(process.cwd(), '.env');

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export function loadEnvFile(filePath = ENV_FILE) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = stripQuotes(trimmed.slice(separator + 1));
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = value;
  }
}

export function applyEnvOverrides(settings) {
  return {
    ...settings,
    openRouterApiKey: process.env.OPENROUTER_API_KEY || settings.openRouterApiKey,
    openRouterModel: process.env.OPENROUTER_MODEL || settings.openRouterModel,
    twitterApiKey:
      process.env.TWITTERAPI_IO_KEY ||
      process.env.TWITTER_API_KEY ||
      settings.twitterApiKey,
    smtpHost: process.env.SMTP_HOST || settings.smtpHost,
    smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : settings.smtpPort,
    smtpSecure:
      process.env.SMTP_SECURE !== undefined
        ? parseBoolean(process.env.SMTP_SECURE, false)
        : settings.smtpSecure,
    smtpUser: process.env.SMTP_USER || settings.smtpUser,
    smtpPass: process.env.SMTP_PASS || settings.smtpPass,
    emailFrom: process.env.EMAIL_FROM || settings.emailFrom,
    emailTo: process.env.EMAIL_TO || settings.emailTo
  };
}

export function envManagedFields() {
  return {
    openRouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    openRouterModel: Boolean(process.env.OPENROUTER_MODEL),
    twitterApiKey: Boolean(process.env.TWITTERAPI_IO_KEY || process.env.TWITTER_API_KEY),
    smtpHost: Boolean(process.env.SMTP_HOST),
    smtpPort: Boolean(process.env.SMTP_PORT),
    smtpSecure: process.env.SMTP_SECURE !== undefined,
    smtpUser: Boolean(process.env.SMTP_USER),
    smtpPass: Boolean(process.env.SMTP_PASS),
    emailFrom: Boolean(process.env.EMAIL_FROM),
    emailTo: Boolean(process.env.EMAIL_TO)
  };
}
