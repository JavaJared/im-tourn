# I'm Tourn - Setup Guide

This guide will walk you through setting up your Firebase project and deploying I'm Tourn.

## Prerequisites

- Node.js 18+ installed
- A Google account

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"** (or "Add project")
3. Enter project name: `im-tourn` (or any name you prefer)
4. Disable Google Analytics (optional, not needed for this app)
5. Click **"Create project"**

## Step 2: Enable Authentication

1. In your Firebase project, go to **Build → Authentication**
2. Click **"Get started"**
3. Under **Sign-in providers**, enable:
   - **Email/Password**: Click, toggle "Enable", and Save
   - **Google**: Click, toggle "Enable", select your support email, and Save

## Step 3: Create Firestore Database

1. Go to **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in production mode"** (we'll deploy rules)
4. Select a location closest to your users (e.g., `us-central1`)
5. Click **"Enable"**

## Step 4: Register a Web App

1. Go to **Project Overview** (click the gear icon → Project settings)
2. Scroll down to **"Your apps"** section
3. Click the **Web icon** (`</>`) to add a web app
4. Enter app nickname: `im-tourn-web`
5. Check **"Also set up Firebase Hosting"**
6. Click **"Register app"**
7. **Copy the firebaseConfig object** - you'll need this!

## Step 5: Configure the App

1. Open `src/firebase.js`
2. Replace the placeholder config with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",              // Your actual API key
  authDomain: "im-tourn.firebaseapp.com",
  projectId: "im-tourn",
  storageBucket: "im-tourn.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## Step 6: Install Dependencies

Open a terminal in the project folder and run:

```bash
npm install
```

## Step 7: Install Firebase CLI

If you haven't already, install the Firebase CLI globally:

```bash
npm install -g firebase-tools
```

Then login to Firebase:

```bash
firebase login
```

## Step 8: Initialize Firebase in the Project

```bash
firebase init
```

When prompted:
- Select **Firestore** and **Hosting**
- Choose **"Use an existing project"** and select your project
- Accept default file names for Firestore rules and indexes
- Set public directory to: `dist`
- Configure as single-page app: **Yes**
- Don't overwrite `index.html`

## Step 9: Deploy Firestore Rules

```bash
firebase deploy --only firestore
```

## Step 10: Build and Deploy

Build the production version:

```bash
npm run build
```

Deploy to Firebase Hosting:

```bash
firebase deploy --only hosting
```

Your site will be live at: `https://your-project-id.web.app`

---

## Local Development

To run the app locally:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

---

## Project Structure

```
im-tourn/
├── src/
│   ├── contexts/
│   │   └── AuthContext.jsx    # Authentication state management
│   ├── services/
│   │   └── bracketService.js  # Firestore CRUD operations
│   ├── App.jsx                # Main application component
│   ├── App.css                # Styles
│   ├── firebase.js            # Firebase configuration
│   └── main.jsx               # Entry point
├── firebase.json              # Firebase hosting config
├── firestore.rules            # Security rules
├── firestore.indexes.json     # Database indexes
├── package.json
├── vite.config.js
└── index.html
```

---

## Features

- **User Authentication**: Email/password and Google sign-in
- **Create Brackets**: Build tournament brackets with 4, 8, 16, or 32 entries
- **Fill Out Brackets**: Select winners through each round
- **PDF Export**: Download completed brackets as PDF
- **My Brackets**: View and manage brackets you've created
- **Real-time Data**: All brackets stored in Firestore

---

## Troubleshooting

### "Permission denied" errors
- Make sure you've deployed Firestore rules: `firebase deploy --only firestore`
- Check that the user is authenticated when creating brackets

### Google Sign-in not working
- Verify Google provider is enabled in Firebase Console
- Check that your domain is in the authorized domains list

### Indexes error
- Deploy indexes: `firebase deploy --only firestore:indexes`
- Wait a few minutes for indexes to build

---

## Custom Domain (Optional)

1. Go to **Hosting** in Firebase Console
2. Click **"Add custom domain"**
3. Follow the instructions to verify and connect your domain

---

Need help? Check the [Firebase Documentation](https://firebase.google.com/docs)
