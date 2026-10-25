import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import OAuthConsentScreen from './screens/OAuthConsentScreen.tsx';
import ConnectScreen from './screens/ConnectScreen.tsx';
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

root.render(
  <React.StrictMode>
    {window.location.pathname.replace(/\/+$/, '') === '/oauth/consent' ? (
      <OAuthConsentScreen />
    ) : window.location.pathname.replace(/\/+$/, '') === '/connect' ? (
      <ConnectScreen />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
