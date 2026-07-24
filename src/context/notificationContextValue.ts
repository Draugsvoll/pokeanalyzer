import { createContext, useContext } from "react";

export type NotificationTone = "error" | "info" | "success";

export type NotificationContextType = {
  showNotification: (message: string, tone?: NotificationTone) => void;
};

export const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

export function useNotification() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotification must be used inside NotificationProvider");
  }

  return context;
}
