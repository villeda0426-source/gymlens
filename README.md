# GymLens

AI-powered gym equipment identifier. Point your camera at any piece of gym equipment to instantly get tutorials, safety tips, and curated video guides — in English or Spanish.

## Tech Stack

- **Mobile**: React Native + Expo SDK 51
- **Navigation**: Expo Router (file-based)
- **Backend**: Node.js + Express
- **Database**: Supabase (Postgres + Auth + Storage)
- **AI Vision**: Anthropic Claude API (`claude-sonnet-4-20250514`)
- **Video**: YouTube Data API v3
- **i18n**: i18next (EN/ES)
- **State**: Zustand
- **Styling**: NativeWind (Tailwind for RN)

---

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- An Expo account (for device builds)
- API keys (see below)

---

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd gymlens
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
YOUTUBE_API_KEY=...
API_BASE_URL=http://localhost:3001
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

### 3. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Copy your **Project URL** and **anon key** from **Settings → API**
4. Copy your **service_role key** (keep this server-side only)

### 4. Set up Anthropic API

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key and add it to `.env` as `ANTHROPIC_API_KEY`

### 5. Set up YouTube Data API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **YouTube Data API v3**
3. Create an API key and add it to `.env` as `YOUTUBE_API_KEY`

---

## Running the App

### Start the backend server

```bash
npm run server:dev
```

The server runs on `http://localhost:3001`.

> On a physical device, replace `localhost` with your machine's local IP in `.env`.

### Start the Expo app

```bash
npm start
```

- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan the QR code with Expo Go on a physical device

---

## Project Structure

```
gymlens/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Login & Register
│   ├── (tabs)/            # Main tab screens
│   ├── equipment/[id].tsx # Equipment detail
│   └── feedback.tsx       # Feedback modal
├── components/
│   ├── Camera/            # Camera UI
│   ├── Equipment/         # Equipment cards & tags
│   ├── UI/                # Shared UI components
│   └── Layout/            # Screen wrappers
├── hooks/                 # Custom React hooks
├── lib/                   # API clients (Supabase, Claude, YouTube)
├── locales/               # EN/ES translation files
├── server/                # Express backend
│   ├── routes/            # API route handlers
│   └── services/          # Claude & YouTube services
├── store/                 # Zustand state stores
└── supabase/              # Database schema
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/identify` | Identify equipment from base64 image |
| GET | `/api/search?q=&category=` | Search equipment catalog |
| GET | `/api/equipment/:id` | Get equipment details + videos |
| POST | `/api/feedback` | Submit user feedback |

---

## Features

- **Camera Scan**: Point at any gym equipment for instant AI identification
- **Photo Upload**: Upload from camera roll
- **Manual Search**: Text search with category filters
- **Equipment Detail**: Tutorial steps, safety tips, YouTube videos
- **Bilingual**: Full English/Spanish support with live toggle
- **User Accounts**: Save equipment, view history (Supabase Auth)
- **Guest Mode**: 3 free identifications before signup prompt
- **Feedback**: Star rating + category + message system
- **Dark Theme**: Electric lime accent throughout

---

## Design System

| Token | Value |
|-------|-------|
| Primary (lime) | `#E8FF47` |
| Background | `#0A0A0A` |
| Surface | `#141414` |
| Border | `#2A2A2A` |
| Text | `#F5F5F5` |
| Muted | `#888888` |
| Danger | `#FF4747` |
| Success | `#47FF8E` |

Fonts: Barlow Condensed (display) · DM Sans (body) · Space Mono (labels)
