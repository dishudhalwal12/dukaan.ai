
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

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
    <App />
  </React.StrictMode>
);