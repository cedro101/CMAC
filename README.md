# CMAC

Cedric Macros: a personal macro and calorie tracker, installed on an iPhone as a web app. All logged data stays on the phone in IndexedDB.

## Run locally

1. Copy `.env.example` to `.env.local` and set `APP_PASSCODE`.
2. Run `npm install`, then `npm run dev`, and open http://localhost:3000.

The service worker only runs in production builds. To test it locally, run `npm run build`, then `npm start`.

## Commands

- `npm test` runs the unit tests.
- `npm run lint` runs ESLint.
- `npm run icons` regenerates the app icons in `public/icons`.
