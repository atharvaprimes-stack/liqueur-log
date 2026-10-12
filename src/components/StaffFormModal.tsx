import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';

type StaffFormValues = {
  name: string;
  mobileNumber: string;
  mpin: string;
};

type StaffFormModalProps = {
  visible: boolean;
  title: string;
  submitLabel: string;
  requireMpin: boolean;
  initialValues: StaffFormValues;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: StaffFormValues) => void;
};

export function StaffFormModal({
  visible,
  title,
  submitLabel,
  requireMpin,
  initialValues,
  error,
  saving,
  onClose,
  onSubmit,
}: StaffFormModalProps) {
  const [name, setName] = useState(initialValues.name);
  const [mobileNumber, setMobileNumber] = useState(initialValues.mobileNumber);
  const [mpin, setMpin] = useState(initialValues.mpin);

  useEffect(() => {
    if (visible) {
      setName(initialValues.name);
      setMobileNumber(initialValues.mobileNumber);
      setMpin(initialValues.mpin);
    }
  }, [initialValues.mobileNumber, initialValues.mpin, initialValues.name, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/70 px-5">
        <View className="w-full max-w-md rounded-3xl bg-stone-900 p-5">
          <Text className="text-xl font-semibold text-stone-50">{title}</Text>
          <Text className="mt-1 text-sm text-stone-400">Staff can sign in only for this business.</Text>

          <Text className="mb-2 mt-5 text-sm text-stone-300">Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Staff name"
            placeholderTextColor="#78716c"
            autoCapitalize="words"
            className="rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-base text-stone-50"
          />

          <Text className="mb-2 mt-4 text-sm text-stone-300">Mobile number</Text>
          <TextInput
            value={mobileNumber}
            onChangeText={(value) => setMobileNumber(value.replace(/\D/g, '').slice(0, 10))}
            placeholder="10 digits"
            placeholderTextColor="#78716c"
            keyboardType="number-pad"
            maxLength={10}
            className="rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-base text-stone-50"
          />

          <Text className="mb-2 mt-4 text-sm text-stone-300">
            {requireMpin ? 'Initial MPIN' : 'New MPIN'}
          </Text>
          <TextInput
            value={mpin}
            onChangeText={(value) => setMpin(value.replace(/\D/g, '').slice(0, 4))}
            placeholder={requireMpin ? '4 digits' : 'Leave blank to keep the current MPIN'}
            placeholderTextColor="#78716c"
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            className="rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-base text-stone-50"
          />

          {error ? <Text className="mt-4 text-sm text-red-400">{error}</Text> : null}

          <View className="mt-6 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={onClose}
              className="h-12 flex-1 items-center justify-center rounded-2xl bg-stone-800"
            >
              <Text className="font-medium text-stone-200">Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => onSubmit({ name, mobileNumber, mpin })}
              className="h-12 flex-1 items-center justify-center rounded-2xl bg-amber-500 disabled:opacity-60"
            >
              {saving ? (
                <ActivityIndicator color="#1c1917" />
              ) : (
                <Text className="font-semibold text-stone-950">{submitLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
