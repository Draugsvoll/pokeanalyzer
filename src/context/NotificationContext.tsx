import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import "./NotificationContext.scss";
import {
  NotificationContext,
  type NotificationTone,
} from "./notificationContextValue";

type AppNotification = {
  id: number;
  message: string;
  tone: NotificationTone;
};

const NOTIFICATION_DURATION_MS = 3_500;

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const nextId = useRef(0);
  const [notification, setNotification] = useState<AppNotification | null>(null);

  const showNotification = useCallback(
    (message: string, tone: NotificationTone = "success") => {
      nextId.current += 1;
      setNotification({ id: nextId.current, message, tone });
    },
    [],
  );

  useEffect(() => {
    if (!notification) return;

    const timeout = window.setTimeout(
      () => setNotification(null),
      NOTIFICATION_DURATION_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [notification]);

  const NotificationIcon = notification?.tone === "error"
    ? XCircle
    : notification?.tone === "info"
      ? Info
      : CheckCircle2;

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {notification && (
        <div
          key={notification.id}
          className={`app-notification app-notification--${notification.tone}`}
          role={notification.tone === "error" ? "alert" : "status"}
          aria-live={notification.tone === "error" ? "assertive" : "polite"}
        >
          <NotificationIcon aria-hidden="true" />
          <span>{notification.message}</span>
          <button
            type="button"
            aria-label="Lukk varsel"
            onClick={() => setNotification(null)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </NotificationContext.Provider>
  );
}
