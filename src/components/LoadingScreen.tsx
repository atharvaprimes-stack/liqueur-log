import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '../theme/theme-context';

export function LoadingScreen() {
  const { palette } = useTheme();

  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <ActivityIndicator color={palette.accent} />
    </View>
  );
}
