import { readPreference, writePreference } from '../data/local/preferences';

type SessionCredentials = {
  mobileNumber: string;
  mpin: string;
};

const CREDENTIALS_KEY = 'session_credentials';

let credentials: SessionCredentials | null = null;
let sessionInteractionAt = 0;

function isCredentials(value: unknown): value is SessionCredentials {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.mobileNumber === 'string' && typeof row.mpin === 'string' && row.mobileNumber.length > 0 && row.mpin.length > 0;
}

export function setSessionCredentials(value: SessionCredentials): void {
  credentials = value;
  void writePreference(CREDENTIALS_KEY, JSON.stringify(value)).catch(() => undefined);
}

export function getSessionCredentials(): SessionCredentials | null {
  return credentials;
}

/** Load saved login credentials so sync works after an app restart. */
export async function hydrateSessionCredentials(): Promise<SessionCredentials | null> {
  if (credentials) {
    return credentials;
  }
  const raw = await readPreference(CREDENTIALS_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isCredentials(parsed)) {
      return null;
    }
    credentials = parsed;
    return credentials;
  } catch {
    return null;
  }
}

export function clearSessionCredentials(): void {
  credentials = null;
  void writePreference(CREDENTIALS_KEY, '').catch(() => undefined);
}

export function getSessionInteractionAt(): number {
  return sessionInteractionAt;
}

export function setSessionInteractionAt(value: number): void {
  sessionInteractionAt = value;
}
