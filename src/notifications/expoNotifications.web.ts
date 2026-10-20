/** Web stub — expo-notifications has no working web build in this project. */
export const AndroidImportance = { HIGH: 4 } as const;
export const AndroidNotificationVisibility = { PUBLIC: 1 } as const;

export function setNotificationHandler(_handler: unknown): void {}

export async function setNotificationChannelAsync(_id: string, _channel: unknown): Promise<void> {}

export async function getPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'denied' };
}

export async function requestPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'denied' };
}

export async function getExpoPushTokenAsync(_options?: unknown): Promise<{ data: string }> {
  return { data: '' };
}

export async function scheduleNotificationAsync(_options: unknown): Promise<string> {
  return '';
}
