import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/authContextValue";
import "./Admin.scss";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const [adminCheck, setAdminCheck] = useState<{
    status: "checking" | "allowed" | "denied";
    uid: string | null;
  }>({ status: "checking", uid: null });

  useEffect(() => {
    if (authLoading || !user) return;

    const checkedUid = user.uid;
    const controller = new AbortController();

    void user
      .getIdToken()
      .then((token) =>
        fetch(`${API_URL}/api/admin/check`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }),
      )
      .then((response) => {
        if (!controller.signal.aborted) {
          setAdminCheck({
            status: response.ok ? "allowed" : "denied",
            uid: checkedUid,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAdminCheck({ status: "denied", uid: checkedUid });
        }
      });

    return () => controller.abort();
  }, [authLoading, user]);

  if (authLoading) {
    return <div className="admin-page admin-page--status">Loading…</div>;
  }

  if (!user) return <Navigate to="/" replace />;

  const checking =
    adminCheck.uid !== user.uid || adminCheck.status === "checking";
  if (checking) {
    return (
      <div className="admin-page admin-page--status">Checking permissions…</div>
    );
  }

  if (adminCheck.status !== "allowed") return <Navigate to="/" replace />;

  return (
    <div className="admin-page">
      <p className="admin-page__eyebrow">Admin</p>
      <h1>Dashboard</h1>
    </div>
  );
}
