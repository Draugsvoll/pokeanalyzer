import React, { useEffect, useRef, useState } from 'react';
import './Header.scss'
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from "lucide-react";
import LoginModal from '../loginmodal/Loginmodal';
import Button from "../button/Button";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../hooks/notifications";
import { formatTimestampDateTime } from "../../utils/timestamp";

export const Header: React.FC = () => {
  const {user, logout} = useAuth()
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading: loadingNotifications,
    error: notificationsError,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  } = useNotifications(user?.uid);

  const handleNotificationClick = async (notificationId: string | undefined, listingId: string) => {
    await markNotificationAsRead(notificationId);
    setNotificationsOpen(false);
    navigate(`/listing/${listingId}`);
  };

  useEffect(() => {
    if (!notificationsOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        !notificationsRef.current?.contains(target)
      ) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [notificationsOpen]);
  
  return (
   <header className="header">
        <div className="nav-container">
          <Link to="/" className="logo">
          <div className="logo">
            <span>PokéMarket</span>
          </div>
          </Link>
          <div className="nav-links">
            <Link to="/">Kjøp</Link>
            <Link to="/sell">Selg</Link>
            <Link to="/">Utforsk kort</Link>
          </div>
          <div className="btn-container">
            {user ? (
              <>
              <div className="notifications" ref={notificationsRef}>
                <button
                  className="notifications__button"
                  type="button"
                  aria-label="Varsler"
                  onClick={() => setNotificationsOpen((current) => !current)}
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="notifications__badge">{unreadCount}</span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="notifications__menu">
                    <div className="notifications__header">
                      <p>Varsler</p>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllNotificationsAsRead}
                        >
                          Marker alle lest
                        </button>
                      )}
                    </div>

                    {loadingNotifications ? (
                      <p className="notifications__empty">Laster varsler...</p>
                    ) : notificationsError ? (
                      <p className="notifications__empty">{notificationsError}</p>
                    ) : notifications.length === 0 ? (
                      <p className="notifications__empty">Ingen nye varsler.</p>
                    ) : (
                      <div className="notifications__list">
                        {notifications.map((notification) => (
                          <button
                            className="notifications__item"
                            key={notification.id}
                            type="button"
                            onClick={() =>
                              handleNotificationClick(
                                notification.id,
                                notification.listingId
                              )
                            }
                          >
                            <span className="notifications__title">
                              Nytt bud på {notification.listingTitle}
                            </span>
                            <span className="notifications__meta">
                              {notification.bidderName || "Ukjent bruker"} bød{" "}
                              {notification.bidAmount} kr
                            </span>
                            <span className="notifications__date">
                              {formatTimestampDateTime(notification.createdAt)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Link to="/profile">
                Min Konto
              </Link>
              <Button className="btn" onClick={logout}>
                Logg ut
              </Button>
              </>
            ) : (
              <>
                <Button className="btn" onClick={() => navigate("/signup")}>
                  signup
                </Button>

                <Button className="btn" onClick={() => setOpen(true)}>
                  Logg inn
                </Button>
              </>
            )}
          </div>
        </div>
        <LoginModal
          isOpen={open}
          onClose={() => setOpen(false)}
        />
      </header>
  );
};
