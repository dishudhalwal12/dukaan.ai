#!/bin/bash

# Setup branch
git checkout --orphan breeze-commits || true
git rm -rf --cached . || true

# 1
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html tailwind.config.js postcss.config.js eslint.config.js .gitignore .env.local 
git commit -m "chore: initial project setup and config" || true

# 2
git add public/ 
git commit -m "chore: add public assets" || true

# 3
git add src/main.tsx src/index.css src/vite-env.d.ts index.css || true
git commit -m "feat: core react entrypoint" || true

# 4
git add types.ts data/ || true
git commit -m "feat: standard types and mock data" || true

# 5
git add contexts/ || true
git commit -m "feat: state management context providers" || true

# 6
git add components/Card.tsx components/Toast.tsx || true
git commit -m "feat: base UI components" || true

# 7
git add screens/OnboardingFlow.tsx || true
git commit -m "feat: dynamic AI onboarding flow screen" || true

# 8
git add screens/DashboardScreen.tsx screens/CatalogScreen.tsx screens/OrdersScreen.tsx || true
git commit -m "feat: main dashboard and vendor screens" || true

# 9
git add screens/SettingsScreen.tsx screens/settings/ || true
git commit -m "feat: robust settings configuration screens" || true

# 10
git add App.tsx index.tsx || true
git commit -m "feat: main application router and layout" || true

# 11
git add services/ai.ts || true
git commit -m "feat: gemini AI insight generation integration" || true

# 12
git add services/uploadService.ts utils/parsers.ts components/UploadMenu.tsx || true
git commit -m "feat: OCR multi-modal uploads and parsers" || true

# 13
git add firebase.ts firebase.json firestore.rules firestore.indexes.json .firebaserc services/cloudSync.ts || true
git commit -m "feat: local-first firestore integration" || true

# 14
git add services/auth.ts components/AuthModal.tsx || true
git commit -m "feat: optional auth sync modal post-onboarding" || true

# 15
git add README.md || true
git commit -m "docs: breathtaking hackathon README presentation" || true

# 16
git add . || true
git commit -m "chore: final code stabilization" || true

git remote add breeze https://github.com/dishudhalwal12/Breeze-26.git || git remote set-url breeze https://github.com/dishudhalwal12/Breeze-26.git
git push -f breeze breeze-commits:main
git checkout main
