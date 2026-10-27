import { PermissionsAndroid, Platform } from 'react-native';

export type BluetoothPermissionResult = 'granted' | 'denied' | 'unavailable';

const SCAN = 'android.permission.BLUETOOTH_SCAN';
const CONNECT = 'android.permission.BLUETOOTH_CONNECT';
const FINE_LOCATION = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

/**
 * Android 12+ needs Nearby devices (SCAN + CONNECT). Classic discovery often
 * still needs Location when BLUETOOTH_SCAN is not marked neverForLocation.
 */
export async function ensureBluetoothPermissions(): Promise<BluetoothPermissionResult> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }

  const api = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  const needed: string[] = [];

  if (api >= 31) {
    needed.push(SCAN, CONNECT);
  }
  // Discovery / bonded-device reads still fail on many OEMs without location.
  needed.push(FINE_LOCATION);

  try {
    const statuses = await PermissionsAndroid.requestMultiple(
      needed as (typeof FINE_LOCATION)[],
    );

    const ok = needed.every((permission) => {
      const status = statuses[permission as keyof typeof statuses];
      return status === PermissionsAndroid.RESULTS.GRANTED;
    });

    return ok ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
