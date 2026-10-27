import { isRunningInExpoGo } from "expo";
import { Platform, Vibration } from "react-native";

const expoGoAndroid = isRunningInExpoGo() && Platform.OS === "android";

type PermissionStatus = { granted: boolean };

type NotificationResponseLike = {
  notification: { request: { content: { data?: Record<string, unknown> } } };
};

type Notifier = {
  getPermissionsAsync: () => Promise<PermissionStatus>;
  requestPermissionsAsync: () => Promise<PermissionStatus>;
  setNotificationChannelAsync: (
    id: string,
    channel: { name: string; importance: number; vibrationPattern: number[] }
  ) => Promise<unknown>;
  scheduleNotificationAsync: (request: {
    content: { title: string; body: string; data?: Record<string, unknown>; sound?: boolean };
    trigger: null | { channelId: string };
  }) => Promise<string>;
  AndroidImportance: { MAX: number };
  getExpoPushTokenAsync?: (options: { projectId: string }) => Promise<{ data: string }>;
  addNotificationResponseReceivedListener?: (listener: (event: NotificationResponseLike) => void) => { remove: () => void };
  getLastNotificationResponseAsync?: () => Promise<NotificationResponseLike | null>;
};

let loading: Promise<Notifier | null> | null = null;
let prepared: Promise<boolean> | null = null;

export function getNotifications() {
  if (!loading) loading = loadNotifier();
  return loading;
}

async function loadNotifier(): Promise<Notifier | null> {
  if (!expoGoAndroid) {
    try {
      const Notifications = await import("expo-notifications");
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      return Notifications;
    } catch {
      // Fall through to the local scheduler.
    }
  }
  try {
    const [handler, permissions, scheduler, channel, importance, emitter] = await Promise.all([
      import("expo-notifications/build/NotificationsHandler"),
      import("expo-notifications/build/NotificationPermissions"),
      import("expo-notifications/build/scheduleNotificationAsync"),
      import("expo-notifications/build/setNotificationChannelAsync"),
      import("expo-notifications/build/NotificationChannelManager.types"),
      import("expo-notifications/build/NotificationsEmitter"),
    ]);
    handler.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return {
      getPermissionsAsync: permissions.getPermissionsAsync,
      requestPermissionsAsync: permissions.requestPermissionsAsync,
      setNotificationChannelAsync: channel.setNotificationChannelAsync,
      scheduleNotificationAsync: scheduler.scheduleNotificationAsync,
      AndroidImportance: importance.AndroidImportance,
      addNotificationResponseReceivedListener: emitter.addNotificationResponseReceivedListener,
      getLastNotificationResponseAsync: emitter.getLastNotificationResponseAsync,
    };
  } catch {
    return null;
  }
}

async function ensureReady() {
  if (!prepared) {
    prepared = (async () => {
      const Notifications = await getNotifications();
      if (!Notifications) return false;
      const current = await Notifications.getPermissionsAsync();
      const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) return false;
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("alerts", {
          name: "Alertas",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 280, 120, 280],
        });
      }
      return true;
    })().catch(() => false);
  }
  return prepared;
}

export function buzz() {
  Vibration.vibrate([0, 280, 120, 280]);
}

export async function presentAlert(title: string, body: string, data?: Record<string, unknown>) {
  buzz();
  const ready = await ensureReady();
  if (!ready) return;
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: Platform.OS === "android" ? { channelId: "alerts" } : null,
  }).catch(() => {});
}
