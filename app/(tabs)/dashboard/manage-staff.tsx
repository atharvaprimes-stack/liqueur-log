import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StaffFormModal } from '../../../src/components/StaffFormModal';
import { useAuth } from '../../../src/context/AuthContext';
import type { User } from '../../../src/domain/models/auth';
import { useManageStaff } from '../../../src/domain/usecases/ManageStaffUseCase';

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; staff: User }
  | null;

export default function ManageStaffScreen() {
  const { currentUser, isReady, logout } = useAuth();
  const { staff, isLoading, error, forbidden, createStaff, updateStaff, setStaffActive } = useManageStaff();
  const [editor, setEditor] = useState<EditorState>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<User | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isReady) {
    return (
      <View className="flex-1 items-center justify-center bg-stone-950">
        <ActivityIndicator color="#f59e0b" />
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  if (currentUser.role !== 'ADMIN' || forbidden) {
    return <Redirect href="/dashboard" />;
  }

  const activeStaff = staff.filter((member) => member.isActive);
  const inactiveStaff = staff.filter((member) => !member.isActive);

  const onSubmit = async (values: { name: string; mobileNumber: string; mpin: string }) => {
    setSaving(true);
    setFormError(null);
    try {
      if (!editor || editor.mode === 'create') {
        await createStaff(values);
      } else {
        await updateStaff({
          id: editor.staff.id,
          name: values.name,
          mobileNumber: values.mobileNumber,
          mpin: values.mpin,
          isActive: editor.staff.isActive,
        });
      }
      setEditor(null);
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Unable to save staff.');
    } finally {
      setSaving(false);
    }
  };

  const changeAccess = (member: User, isActive: boolean) => {
    const run = () => {
      void setStaffActive(member.id, isActive).catch((changeError: unknown) => {
        setFormError(changeError instanceof Error ? changeError.message : 'Unable to update staff.');
      });
    };

    if (isActive) {
      run();
      return;
    }

    setPendingDeactivate(member);
  };

  return (
    <SafeAreaView className="relative flex-1 bg-stone-950">
      <FlatList
        data={[...activeStaff, ...inactiveStaff]}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-5 pb-10"
        ListHeaderComponent={
          <View className="pb-4 pt-4">
            <View className="flex-row items-center justify-between">
              <Pressable accessibilityRole="button" onPress={() => router.back()} className="py-2">
                <Text className="text-sm font-medium text-amber-400">Dashboard</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void logout().then(() => router.replace('/login'));
                }}
                className="py-2"
              >
                <Text className="text-sm text-stone-400">Sign out</Text>
              </Pressable>
            </View>
            <Text className="mt-4 text-3xl font-semibold text-stone-50">Manage staff</Text>
            <Text className="mt-2 text-base text-stone-400">
              People you add can sign in with their mobile number and MPIN for this business only.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFormError(null);
                setEditor({ mode: 'create' });
              }}
              className="mt-5 h-12 items-center justify-center rounded-2xl bg-amber-500"
            >
              <Text className="font-semibold text-stone-950">Add staff</Text>
            </Pressable>
            {error ? <Text className="mt-4 text-sm text-red-400">{error}</Text> : null}
            {isLoading ? <ActivityIndicator className="mt-6" color="#f59e0b" /> : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <View>
            {index === 0 && activeStaff.length > 0 ? <SectionLabel label="Active" /> : null}
            {index === activeStaff.length && inactiveStaff.length > 0 ? <SectionLabel label="Inactive" /> : null}
            <View className="mb-3 rounded-3xl border border-stone-800 bg-stone-900 p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-lg font-medium text-stone-50">{item.name}</Text>
                  <Text className="mt-1 text-sm text-stone-400">{formatMobile(item.mobileNumber)}</Text>
                </View>
                <Text className={item.isActive ? 'text-sm text-emerald-400' : 'text-sm text-stone-500'}>
                  {item.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <View className="mt-4 flex-row gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setFormError(null);
                    setEditor({ mode: 'edit', staff: item });
                  }}
                  className="h-11 flex-1 items-center justify-center rounded-2xl bg-stone-800"
                >
                  <Text className="font-medium text-stone-100">Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => changeAccess(item, !item.isActive)}
                  className="h-11 flex-1 items-center justify-center rounded-2xl bg-stone-800"
                >
                  <Text className="font-medium text-stone-100">{item.isActive ? 'Deactivate' : 'Activate'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <Text className="text-center text-stone-500">No staff yet. Add the first team member.</Text>
          )
        }
      />

      <StaffFormModal
        visible={editor !== null}
        title={editor?.mode === 'edit' ? 'Edit staff' : 'Add staff'}
        submitLabel={editor?.mode === 'edit' ? 'Save changes' : 'Create staff'}
        requireMpin={editor?.mode !== 'edit'}
        initialValues={{
          name: editor?.mode === 'edit' ? editor.staff.name : '',
          mobileNumber: editor?.mode === 'edit' ? editor.staff.mobileNumber : '',
          mpin: '',
        }}
        error={formError}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setEditor(null);
            setFormError(null);
          }
        }}
        onSubmit={(values) => {
          void onSubmit(values);
        }}
      />

      {pendingDeactivate ? (
        <View className="absolute inset-0 items-center justify-center bg-black/70 px-5">
          <View className="w-full max-w-md rounded-3xl bg-stone-900 p-5">
            <Text className="text-xl font-semibold text-stone-50">Deactivate {pendingDeactivate.name}?</Text>
            <Text className="mt-2 text-sm text-stone-400">They will not be able to sign in.</Text>
            <View className="mt-6 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => setPendingDeactivate(null)}
                className="h-12 flex-1 items-center justify-center rounded-2xl bg-stone-800"
              >
                <Text className="font-medium text-stone-200">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const member = pendingDeactivate;
                  setPendingDeactivate(null);
                  void setStaffActive(member.id, false).catch((changeError: unknown) => {
                    setFormError(changeError instanceof Error ? changeError.message : 'Unable to update staff.');
                  });
                }}
                className="h-12 flex-1 items-center justify-center rounded-2xl bg-red-500"
              >
                <Text className="font-semibold text-stone-950">Deactivate</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text className="mb-3 mt-2 text-xs font-semibold tracking-[2px] text-stone-500">{label}</Text>;
}

function formatMobile(value: string): string {
  return value.replace(/(\d{5})(\d{5})/, '$1 $2');
}
