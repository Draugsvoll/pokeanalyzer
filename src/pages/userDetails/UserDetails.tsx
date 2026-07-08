import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../../components/button/Button";
import { db } from "../../firebase";
import type { UserProfile } from "../../types/user.types";
import { useInitials } from "../../hooks/useInitials";
import { formatTimestampDate } from "../../utils/timestamp";
import "./UserDetails.scss";

export default function UserDetails() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const profileInitial = useInitials(userProfile?.firstName);

  useEffect(() => {
    async function fetchUserDetails() {
      if (!userId) {
        setError("Mangler bruker-ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const userSnap = await getDoc(doc(db, "users", userId));
        if (!userSnap.exists()) {
          setUserProfile(null);
          setError("Fant ikke brukeren.");
          return;
        }

        setUserProfile(userSnap.data() as UserProfile);
      } catch (err) {
        console.error("Failed to load user details:", err);
        setError("Kunne ikke hente bruker.");
        setUserProfile(null);
      } finally {
        setLoading(false);
      }
    }

    fetchUserDetails();
  }, [userId]);

  if (loading) return <h1>Loading user...</h1>;

  if (error || !userProfile) {
    return (
      <div className="user-details">
        <h1>{error ?? "Fant ikke brukeren."}</h1>
        <Button onClick={() => navigate(-1)}>Tilbake</Button>
      </div>
    );
  }

  return (
    <div className="user-details">
      <div className="user-details__header">
        <div>
          <p className="user-details__tag">User details</p>
          <h1>{userProfile.username ?? "Ukjent bruker"}</h1>
        </div>
        <Button onClick={() => navigate(-1)}>Tilbake</Button>
      </div>

      <section className="user-details__panel">
        {userProfile.avatar?.trim() ? (
          <img
            className="user-details__avatar"
            src={userProfile.avatar.trim()}
            alt={userProfile.username ?? "User avatar"}
          />
        ) : (
          <div className="user-details__avatar user-details__avatar--fallback">
            {profileInitial}
          </div>
        )}
        <h2>Profil</h2>
        <div className="user-details__grid">
          <p>
            <b>Username:</b> {userProfile.username ?? "N/A"}
          </p>
          <p>
            <b>Name:</b> {userProfile.firstName ?? ""} {userProfile.lastName ?? ""}
          </p>
          <p>
            <b>Email:</b> {userProfile.email ?? "N/A"}
          </p>
          <p>
            <b>City:</b> {userProfile.city ?? "N/A"}
          </p>
          <p>
            <b>Address:</b> {userProfile.address ?? "N/A"}
          </p>
          <p>
            <b>Joined:</b> {formatTimestampDate(userProfile.createdAt)}
          </p>
          <p>
            <b>User ID:</b> {userId}
          </p>
        </div>
      </section>
    </div>
  );
}