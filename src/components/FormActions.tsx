import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { leaveScreen } from '../navigation/leave';
import { useTheme } from '../theme/theme-context';

type ActionTone = 'neutral' | 'accent' | 'danger';

export type ActionButton = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: ActionTone;
};

export function ActionRow({
  leading,
  middle,
  trailing,
  className = 'mt-6',
  pinned = false,
}: {
  leading: ActionButton;
  middle?: ActionButton;
  trailing?: ActionButton;
  className?: string;
  pinned?: boolean;
}) {
  const row = (
    <View className={`${pinned ? '' : className} flex-row gap-3`}>
      <ActionControl button={leading} />
      {middle ? <ActionControl button={middle} /> : null}
      {trailing ? <ActionControl button={trailing} /> : null}
    </View>
  );

  if (!pinned) {
    return row;
  }

  return <View className="border-t border-line bg-canvas px-4 py-3">{row}</View>;
}

export function SaveRow({
  parent,
  onSave,
  saveLabel,
  saving = false,
  saveDisabled = false,
  className = 'mt-6',
}: {
  parent: Href;
  onSave: () => void;
  saveLabel: string;
  saving?: boolean;
  saveDisabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <ActionRow
      className={className}
      leading={{
        label: t('common.cancel'),
        onPress: () => leaveScreen(parent),
        disabled: saving,
      }}
      trailing={{
        label: saveLabel,
        onPress: onSave,
        tone: 'accent',
        busy: saving,
        disabled: saveDisabled,
      }}
    />
  );
}

function ActionControl({ button }: { button: ActionButton }) {
  const { palette } = useTheme();
  const tone = button.tone ?? 'neutral';
  const surface =
    tone === 'accent'
      ? 'bg-accent'
      : tone === 'danger'
        ? 'bg-danger'
        : 'border border-line bg-canvas';
  const label = tone === 'neutral' ? 'text-ink' : 'text-accent-ink';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={button.disabled || button.busy}
      onPress={button.onPress}
      className={`h-12 min-w-0 flex-1 items-center justify-center rounded-lg px-2 disabled:opacity-50 ${surface}`}
    >
      {button.busy ? (
        <ActivityIndicator color={tone === 'neutral' ? palette.accent : palette.accentInk} />
      ) : (
        <Text className={`text-center text-sm font-semibold ${label}`} numberOfLines={2}>
          {button.label}
        </Text>
      )}
    </Pressable>
  );
}
