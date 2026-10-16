import * as Network from 'expo-network';

/** Prefer attempting the network; Android often reports isInternetReachable=false incorrectly. */
export async function isDeviceOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}
