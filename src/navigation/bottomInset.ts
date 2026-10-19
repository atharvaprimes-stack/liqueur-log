import { Dimensions, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom inset for pinned footers. On some Android devices with 3-button
 * navigation, safe-area bottom reports 0 even though the nav bar overlaps UI.
 */
export function resolveBottomInset(reportedBottom: number): number {
  if (reportedBottom > 0 || Platform.OS !== 'android') {
    return reportedBottom;
  }

  const screenHeight = Dimensions.get('screen').height;
  const windowHeight = Dimensions.get('window').height;
  const statusBarHeight = StatusBar.currentHeight ?? 0;
  const measured = Math.round(screenHeight - windowHeight - statusBarHeight);
  return measured > 0 ? measured : 48;
}

export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return resolveBottomInset(insets.bottom);
}
