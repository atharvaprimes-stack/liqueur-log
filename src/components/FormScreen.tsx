import { type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { cssInterop } from 'nativewind';
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';

cssInterop(KeyboardAwareScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
});

cssInterop(KeyboardAvoidingView, {
  className: 'style',
});

/** Typical pinned ActionRow / Save footer height above the keyboard. */
export const FORM_FOOTER_BOTTOM_OFFSET = 88;

type FormScreenProps = {
  children: ReactNode;
  /** Pinned footer (Save/Cancel). Stays above the keyboard. */
  footer?: ReactNode;
  contentContainerClassName?: string;
  /** Extra space above keyboard when scrolling to a focused field. */
  bottomOffset?: number;
  className?: string;
  nestedScrollEnabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Full-screen form shell: auto-scrolls focused TextInputs above the keyboard
 * on Android and iOS. Pass a sticky `footer` for pinned action bars.
 */
export function FormScreen({
  children,
  footer,
  contentContainerClassName = 'px-4 pb-8 pt-4',
  bottomOffset,
  className = 'flex-1',
  nestedScrollEnabled,
  style,
}: FormScreenProps) {
  const resolvedBottomOffset = bottomOffset ?? (footer ? FORM_FOOTER_BOTTOM_OFFSET : 24);

  return (
    <View className={className} style={style}>
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName={contentContainerClassName}
        keyboardShouldPersistTaps="handled"
        bottomOffset={resolvedBottomOffset}
        nestedScrollEnabled={nestedScrollEnabled}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollView>
      {footer ? <FormStickyFooter>{footer}</FormStickyFooter> : null}
    </View>
  );
}

type FormSheetProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  bottomOffset?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Bottom-sheet panel inside a Modal. Lifts with the keyboard and scrolls
 * focused fields into view.
 */
export function FormSheet({
  children,
  className = 'rounded-t-lg border border-line bg-surface px-4 pb-8 pt-4',
  contentClassName,
  bottomOffset = 24,
  style,
}: FormSheetProps) {
  return (
    <KeyboardAvoidingView behavior="padding" className="w-full" style={style}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={bottomOffset}
        bounces={false}
        contentContainerClassName={contentClassName}
        showsVerticalScrollIndicator={false}
      >
        <View className={className}>{children}</View>
      </KeyboardAwareScrollView>
    </KeyboardAvoidingView>
  );
}

type FormDialogProps = {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Centered dialog body inside a Modal. Moves up with the keyboard so
 * bottom fields stay visible.
 */
export function FormDialog({
  children,
  className = 'w-full max-w-md self-center rounded-3xl border border-line bg-surface p-5',
  style,
}: FormDialogProps) {
  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 justify-center" style={style}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        bounces={false}
        contentContainerClassName="grow justify-center py-4"
        showsVerticalScrollIndicator={false}
      >
        <View className={className}>{children}</View>
      </KeyboardAwareScrollView>
    </KeyboardAvoidingView>
  );
}

function FormStickyFooter({ children }: { children: ReactNode }) {
  // Android adjustResize already lifts siblings with the window; translating
  // again would push the footer too high. iOS needs the sticky lift.
  if (Platform.OS === 'android') {
    return <>{children}</>;
  }

  return <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>{children}</KeyboardStickyView>;
}
