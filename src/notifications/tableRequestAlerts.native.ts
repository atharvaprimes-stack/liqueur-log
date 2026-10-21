import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { registerDevicePushTokenRemote } from '../data/remote/tableRequestsRemote';
import type { TableRequest } from '../domain/models/tableRequests';

const CHANNEL_ID = 'table-requests';

let handlerConfigured = false;
let androidChannelReady = false;

function projectId(): string | null {
  const eas = Constants.easConfig?.projectId;
  if (typeof eas === 'string' && eas.length > 0) {
    return eas;
  }
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

export async function configureTableRequestNotifications(): Promise<void> {
  if (!handlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerConfigured = true;
  }

  if (Platform.OS === 'android' && !androidChannelReady) {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Table requests',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    androidChannelReady = true;
  }
}

export async function registerTableRequestPushToken(tenantId: string): Promise<void> {
  if (!Device.isDevice || !tenantId) {
    return;
  }

  await configureTableRequestNotifications();

  const permissions = await Notifications.getPermissionsAsync();
  let status = permissions.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    return;
  }

  const id = projectId();
  if (!id) {
    return;
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId: id,
    })
  ).data;

  await registerDevicePushTokenRemote({
    tenantId,
    token,
    platform: Platform.OS,
  });
}

export async function notifyIncomingTableRequest(request: TableRequest): Promise<void> {
  if (request.status !== 'pending') {
    return;
  }

  // Foreground: the in-app amber badge / Incoming Requests panel is enough.
  if (AppState.currentState === 'active') {
    return;
  }

  await configureTableRequestNotifications();

  const name = request.nameEn.trim() || request.nameMr.trim() || 'Item';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Table ${request.tableId} request`,
      body: `${request.quantity} × ${name}`,
      sound: 'default',
      data: {
        type: 'table_request',
        tableId: request.tableId,
        requestId: request.id,
      },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}
