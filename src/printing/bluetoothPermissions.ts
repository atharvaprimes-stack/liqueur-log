export type BluetoothPermissionResult = 'granted' | 'denied' | 'unavailable';

export async function ensureBluetoothPermissions(): Promise<BluetoothPermissionResult> {
  return 'unavailable';
}
