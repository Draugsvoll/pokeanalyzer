import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { AppNotification } from "../../types/notification.types";
import { getTimestampMillis } from "../../utils/timestamp";

export function useNotifications(userId?: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("read", "==", false)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snap) => {
        const unreadNotifications = snap.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<AppNotification, "id">),
          }))
          .sort(
            (a, b) =>
              getTimestampMillis(b.createdAt) -
              getTimestampMillis(a.createdAt)
          );

        setNotifications(unreadNotifications);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to listen for notifications:", err);
        setError("Kunne ikke hente varsler.");
        setNotifications([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  const markNotificationAsRead = async (notificationId?: string) => {
    if (!notificationId) return;
    await updateDoc(doc(db, "notifications", notificationId), { read: true });
  };

  const markAllNotificationsAsRead = async () => {
    if (!userId || notifications.length === 0) return;

    const unreadQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("read", "==", false)
    );
    const snap = await getDocs(unreadQuery);
    const batch = writeBatch(db);

    snap.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });

    await batch.commit();
  };

  return {
    notifications,
    unreadCount: notifications.length,
    loading,
    error,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  };
}
