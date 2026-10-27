import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { io, type Socket } from "socket.io-client";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { bindLive } from "@/lib/live";
import { getNotifications, presentAlert } from "@/lib/notify";
import { getItem, getServer } from "@/lib/storage";
import type { AppEvent } from "@/lib/types";

type RealtimeState = {
  events: AppEvent[];
  refreshEvents: () => Promise<void>;
  upsertEvent: (event: AppEvent) => void;
};

const RealtimeContext = createContext<RealtimeState>({
  events: [],
  refreshEvents: async () => {},
  upsertEvent: () => {},
});

function sortEvents(events: AppEvent[]) {
  return [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, home, refresh, patchMember } = useAuth();
  const [events, setEvents] = useState<AppEvent[]>([]);

  const upsertEvent = (event: AppEvent) => {
    setEvents((current) => sortEvents([event, ...current.filter((item) => item.id !== event.id)]));
  };

  const refreshEvents = async () => {
    if (!home) {
      setEvents([]);
      return;
    }
    const result = await api.events();
    setEvents(sortEvents(result.events));
  };

  useEffect(() => {
    if (!user || !home) return;
    let socket: Socket | null = null;
    let responseSub: { remove: () => void } | null = null;
    let active = true;

    function openAlert(data?: Record<string, unknown>) {
      const eventId = data?.eventId;
      if (typeof eventId === "string") router.push({ pathname: "/evento/[id]", params: { id: eventId } });
    }

    refreshEvents().catch(() => {});

    (async () => {
      const Notifications = await getNotifications();
      if (Notifications) {
        const sub = Notifications.addNotificationResponseReceivedListener?.((response) => {
          openAlert(response.notification.request.content.data);
        }) ?? null;
        if (active) responseSub = sub;
        else sub?.remove();
        const settings = await Notifications.getPermissionsAsync();
        const granted = settings.granted || (await Notifications.requestPermissionsAsync()).granted;
        if (granted && Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("alerts", {
            name: "Alertas",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 280, 120, 280],
          });
        }
        if (granted && Notifications.getExpoPushTokenAsync) {
          try {
            const projectId =
              Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
            if (projectId) {
              const token = await Notifications.getExpoPushTokenAsync({ projectId });
              await api.registerPush(token.data);
            }
          } catch {
            // The alert still arrives through the live channel.
          }
        }
      }

      const server = await getServer();
      const authToken = await getItem("token");
      if (!active || !authToken) return;
      socket = io(server, { auth: { token: authToken }, transports: ["websocket"] });
      bindLive((body) => socket?.emit("live", body));
      socket.on("member:update", patchMember);
      socket.on("home:changed", () => {
        refresh().catch(() => {});
      });
      socket.on("plan:nube", (body: { body?: string }) => {
        presentAlert("Plan Nube", body?.body || "El hogar pasó a plan Nube.").catch(() => {});
        refresh().catch(() => {});
      });
      socket.on("plan:cancel", (body: { body?: string }) => {
        presentAlert("Pago cancelado", body?.body || "Se canceló el pago del hogar.").catch(() => {});
        refresh().catch(() => {});
      });
      socket.on("home:closed", () => {
        refresh().catch(() => {});
      });
      const onEvent = (event: AppEvent) => {
        upsertEvent(event);
        if (event.status === "alert" && event.userId !== user.id) {
          const clip = event.videoUrl || event.hasClip ? " Abre el aviso para guardar el video en el teléfono." : "";
          presentAlert("Umbral", `${event.userName} necesita atención.${clip}`, { eventId: event.id }).catch(() => {});
        }
      };
      socket.on("alert:pending", onEvent);
      socket.on("alert:cancelled", onEvent);
      socket.on("alert:raised", onEvent);
      socket.on("alert:resolved", onEvent);
    })().catch(() => {});

    return () => {
      active = false;
      responseSub?.remove();
      bindLive(null);
      socket?.disconnect();
    };
  }, [user?.id, home?.id]);

  const value = useMemo(() => ({ events, refreshEvents, upsertEvent }), [events]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
