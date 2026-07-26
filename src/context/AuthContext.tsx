import {
  useEffect,
  useState,
} from "react";

import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "../firebase";
import { AuthContext } from "./authContextValue";
import { useNotification } from "./notificationContextValue";
import { getUserProfileSessionKey } from "../utils/cache";

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotification();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return unsub;
  }, []);

  const logout = async () => {
    if (user) {
      sessionStorage.removeItem(getUserProfileSessionKey(user.uid));
    }
    await signOut(auth);
    showNotification("Du er nå logget ut.");
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
