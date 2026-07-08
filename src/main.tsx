import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import './index.scss'
import { AuthProvider } from './context/AuthContext.tsx'
import { PortfolioProvider } from './context/PortfolioCacheContext.tsx'
import { SavedListingsProvider } from './context/SavedListingsCacheContext.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
    <AuthProvider>
      <PortfolioProvider>
        <SavedListingsProvider>
          <App />
        </SavedListingsProvider>
      </PortfolioProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
