import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter/wght.css";
import "./index.scss";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
import { WatchlistProvider } from "./context/WatchlistCacheContext.tsx";
import { PortfolioProvider } from "./context/PortfolioCacheContext.tsx";
import { NotificationProvider } from "./context/NotificationContext.tsx";
import { MembershipSubscriptionProvider } from "./subscriptions";
import { EbayCreditsProvider } from "./ebay/useEbayCredits";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <NotificationProvider>
        <AuthProvider>
          <MembershipSubscriptionProvider>
            <EbayCreditsProvider>
              <PortfolioProvider>
                <WatchlistProvider>
                  <App />
                </WatchlistProvider>
              </PortfolioProvider>
            </EbayCreditsProvider>
          </MembershipSubscriptionProvider>
        </AuthProvider>
      </NotificationProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
