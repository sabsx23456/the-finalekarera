# Sabong App

A modern Sabong (Cockfighting) management and analytics dashboard built with React, TypeScript, and Vite.

## Features

- **Event Management**: Create and manage sabong events.
- **Match Management**: comprehensive match tracking and history.
- **Analytics**: Real-time analytics for user activity, commissions, and profits.
- **User Management**: Admin tools for managing platform users.

## tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS 4
- **State Management**: Zustand
- **Backend/Service**: Supabase (Auth, Database)
- **Routing**: React Router 7

## Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- npm or yarn

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in the root directory and add your environment variables:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    VITE_OPENROUTER_MODEL=openai/gpt-5.2-chat
    VITE_OPENROUTER_VISION_MODEL=google/gemini-3-flash-preview

    # Server-only (for Vercel /api endpoints)
    # Never expose these as VITE_*
    OPENROUTER_API_KEY=your_openrouter_key
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
    ```

Notes:
- If your Vercel project already has `VITE_OPENROUTER_API_KEY` set, the server `/api/openrouter/*` endpoints will still accept it as a legacy fallback, but you should migrate to `OPENROUTER_API_KEY` (and rotate the key) to avoid accidental exposure in future frontend code changes.
- If your Vercel project already has `VITE_SUPABASE_SERVICE_ROLE_KEY` set, the server `/api/admin/*` endpoints will still accept it as a legacy fallback, but you should migrate to `SUPABASE_SERVICE_ROLE_KEY`.
4.  Start the development server:
    ```bash
    npm run dev
    ```

## Building for Production

To build the application for production:

```bash
npm run build
```

The output will be in the `dist` directory.

## Deploying

See `DEPLOYMENT.md` for GitHub + Vercel deployment steps and required environment variables.

## Supabase Notes

### Karera: Tournament Days (Banner + Grouping)

Karera races can be grouped into a "tournament day" (with an optional banner image) via `karera_tournaments`.

1. Run the SQL in `scripts/sql/karera_tournaments.sql` once in the Supabase SQL Editor.
2. In the admin "Event Console -> KARERA" tab, create/select a tournament, then create races under that tournament.

### Karera: Announce Winner (Admin)

The admin "Event Console -> KARERA -> Announce" button calls a Supabase RPC `announce_karera_winner`.
Run the SQL in `scripts/sql/announce_karera_winner.sql` once in the Supabase SQL Editor to create/update it.

This SQL also adds a `karera_races.result` `jsonb` column (if missing) so the Karera lobby can show the previous race results (winners + odds) to users.

### Karera: Offline Mode (Admin)

The admin "Event Console -> KARERA -> Karera Lobby" toggle stores settings in `app_settings`:

- `karera_offline`: `true`/`false` (string)
- `karera_offline_next_race`: free text shown to users while offline

Users read these settings in realtime; ensure `app_settings` RLS allows read for users, and write/upsert for admins only.

## License

[Add License Here]
