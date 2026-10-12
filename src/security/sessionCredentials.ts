type SessionCredentials = {
  mobileNumber: string;
  mpin: string;
};

let credentials: SessionCredentials | null = null;
let sessionInteractionAt = 0;

export function setSessionCredentials(value: SessionCredentials): void {
  credentials = value;
}

export function getSessionCredentials(): SessionCredentials | null {
  return credentials;
}

export function clearSessionCredentials(): void {
  credentials = null;
}

export function getSessionInteractionAt(): number {
  return sessionInteractionAt;
}

export function setSessionInteractionAt(value: number): void {
  sessionInteractionAt = value;
}
