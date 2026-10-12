import { Pressable, Text, View } from 'react-native';

type NumericKeypadProps = {
  disabled?: boolean;
  onDigit: (digit: string) => void;
  onDelete: () => void;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'] as const;

export function NumericKeypad({ disabled = false, onDigit, onDelete }: NumericKeypadProps) {
  return (
    <View className="gap-3">
      {[0, 1, 2, 3].map((row) => (
        <View key={row} className="flex-row gap-3">
          {KEYS.slice(row * 3, row * 3 + 3).map((key) => {
            if (!key) {
              return <View key={`${row}-spacer`} className="h-16 flex-1" />;
            }

            const isDelete = key === 'delete';
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={isDelete ? 'Delete digit' : key}
                disabled={disabled}
                onPress={() => (isDelete ? onDelete() : onDigit(key))}
                className="h-14 flex-1 items-center justify-center rounded-2xl bg-stone-800 active:bg-amber-500 disabled:opacity-40"
              >
                <Text className="text-2xl font-medium text-stone-50">{isDelete ? '⌫' : key}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
