import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import OAuthConsentScreen from './screens/OAuthConsentScreen.tsx';
import ConnectScreen from './screens/ConnectScreen.tsx';
import PrivacyScreen from './screens/public/PrivacyScreen.tsx';
import TermsScreen from './screens/public/TermsScreen.tsx';
import SupportScreen from './screens/public/SupportScreen.tsx';
import { getInstallId, instrumentRequestFailures } from './utils/telemetry.ts';
import './styles/walkthrough.css';

// Before React mounts: count failed requests for the session row, and make sure
// this device has an install id. Both are local-only — a guest's id is created
// but never sent anywhere.
instrumentRequestFailures();
getInstallId();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Check if a root has already been created for this element to avoid re-initialization.
// This is a common pattern to fix warnings in environments that might re-execute the script.
let root = (rootElement as any)._reactRootContainer;
if (!root) {
  root = ReactDOM.createRoot(rootElement);
  (rootElement as any)._reactRootContainer = root;
}

// Public pages mount outside the merchant app: they must render for a customer,
// a search crawler, and a reviewer who has never signed in.
const publicPath = window.location.pathname.replace(/\/+$/, '');
const publicPage =
  publicPath === '/oauth/consent' ? <OAuthConsentScreen />
    : publicPath === '/connect' ? <ConnectScreen />
      : publicPath === '/privacy' ? <PrivacyScreen />
        : publicPath === '/terms' ? <TermsScreen />
          : publicPath === '/support' ? <SupportScreen />
            : null;

root.render(
  <React.StrictMode>
    {publicPage ?? <App />}
  </React.StrictMode>
);
