import { doc, getDoc, Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import "./Profile.scss";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { getUserProfileSessionKey } from "../../utils/cache";
import { PokemonCard } from "../../components/pokemonCard/PokemonCard";
import { GridView } from "../../components/gridView/GridView";
import Button from "../../components/button/Button";
import type { UserProfile } from "../../types/user.types";
import { useInitials } from "../../hooks/useInitials";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import { formatTimestampString } from "../../utils/timestamp";

export default function Profile() {
  const { user: authUser, loading: authLoading, logout } = useAuth();
  const { portfolio } = usePortfolioCache();
  const { removePokemonFromPortfolio } = usePokemonPortfolio();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profileInitial = useInitials(profile?.firstName);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!authUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const cacheKey = getUserProfileSessionKey(authUser.uid);
        const cachedProfile = sessionStorage.getItem(cacheKey);

        if (cachedProfile) {
          const parsedProfile = JSON.parse(cachedProfile);
          if (parsedProfile.createdAt?.seconds) {
            parsedProfile.createdAt = Timestamp.fromMillis(
              parsedProfile.createdAt.seconds * 1000
            );
          }
          setProfile(parsedProfile);
          return;
        }

        const userRef = doc(db, "users", authUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setProfile(null);
          setError("Logged in but no user profile found.");
          return;
        }

        const userData = userSnap.data();

        sessionStorage.setItem(cacheKey, JSON.stringify(userData));
        setProfile(userData);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch user data.");
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [authUser]);

  if (authLoading || loading) return <h1>Loading...</h1>;

  if (!authUser) return <h1>User not logged in</h1>;

  if (error) {
    return (
      <div>
        <h1>{error}</h1>
        <Button onClick={logout}>Log out</Button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <h1>Logged in but no profile data found</h1>
        <Button onClick={logout}>Log out</Button>
      </div>
    );
  }

  return (
    <div className="profile">
      <h1>My Profile</h1>

      <div className="profile__card">
        {profile.avatar?.trim() ? (
          <img
            className="profile__avatar"
            src={profile.avatar.trim()}
            alt={profile.username ?? "Profile avatar"}
          />
        ) : (
          <div className="profile__avatar profile__avatar--fallback">
            {profileInitial}
          </div>
        )}
        <p>
          <b>Username:</b> {profile.username}
        </p>
        <p>
          <b>Email:</b> {profile.email}
        </p>
        <p>
          <b>User ID:</b> {authUser.uid}
        </p>
        <p>
          <b>Joined:</b> {formatTimestampString(profile.createdAt)}
        </p>
      </div>

      <section className="profile__portfolio">
        <h2>My collection</h2>

        {portfolio.length === 0 ? (
          <p>No saved cards yet.</p>
        ) : (
          <GridView>
            {portfolio.map((card: PokemonCardType) => (
              <div key={card.id} className="profile__portfolio-card">
                <PokemonCard card={card} />
                <Button variant="danger" onClick={() => removePokemonFromPortfolio(card.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </GridView>
        )}
      </section>

      <div className="profile__actions">
        <Button onClick={logout}>Log out</Button>
      </div>
    </div>
  );
}
