// Default / TypeScript entry. Must NOT import native notification code —
// Metro on web can fall through to this file, and expo-notifications breaks web.
export {
  configureTableRequestNotifications,
  notifyIncomingTableRequest,
  registerTableRequestPushToken,
} from './tableRequestAlerts.web';
