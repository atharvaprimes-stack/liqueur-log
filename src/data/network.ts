import * as Network from 'expo-network';

export async function isDeviceOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) {
      return false;
    }
    return state.isInternetReachable !== false;
  } catch {
    return false;
  }
}
