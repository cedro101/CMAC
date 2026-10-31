# CMAC

A chat-first macro and calorie tracker, built as an installable phone web app. You tell it what you ate in plain language, and it looks up real nutrition data and shows a card to confirm. There's no manual food searching.

## Why I built it

Most calorie trackers make you search for every item and log it by hand, one at a time. I wanted to just tell an AI what I ate and have it handle the rest. It was also a project I wanted to build for fun, and I now use it every day.

I designed the product and directed the build using [Claude Code](https://claude.com/claude-code), an AI coding tool, which wrote most of the code. I tested each stage on my iPhone with my own data.

## What it does

- **Log by chat:** "350g chicken raw, 200g potatoes" becomes a card showing each item, its macros and its source. Nothing saves until you confirm.
- **Reliable numbers:** lookups go through saved foods, then your own history, then USDA FoodData Central, then the web, and only then an estimate, which is always labelled as one.
- **Label photos:** photograph a nutrition label and confirm the card to save it as a food.
- **Batch cooking:** "1078 g raw chicken became 850 g cooked", then "190 g of the chicken batch".
- **Progress:** daily weights with a 7-day trend line, calories against your goal, and weekly averages.
- **Maintenance estimate:** compares your logged intake and weight trend with a body-stats formula, and reports its confidence.
- **Your data stays with you:** everything is stored on the phone, with JSON export and import.

## How it works

The interesting part is the split between what the model decides and what code guarantees.

| Decision | Why |
| --- | --- |
| **The model never supplies database numbers.** `search_food` returns references, and `propose_log` passes a reference plus an amount. Code calculates the macros. | A language model can misremember or invent a number. Here it chooses the food, and arithmetic does the rest. |
| **Rules are enforced in code as well as in the prompt.** A weighed meat, rice or potato item with no raw or cooked state is rejected, which makes the bot ask. | Raw and cooked weights differ a lot in calories per gram, and instructions alone can be ignored. |
| **Tools run on the phone.** `/api/chat` runs one Claude turn and streams it back. The phone executes tool calls against IndexedDB and sends the results back. | There's no database server, so personal data is only sent when needed to answer a message. |
| **Conversation history is append-only and saved at every step.** | Phones often kill background apps. If that happens mid-reply, open tool calls are closed cleanly and the conversation can be retried. |
| **Every edit can be undone.** Each change records its before and after, and an Undo is refused if the record has changed since. | An old Undo can't wipe out a newer change. |
| **The logging day starts at 4 am.** All day calculations go through a single function. | Late-night food counts toward the day it belongs to. |

## Tech

Next.js (App Router), TypeScript, Tailwind CSS, Dexie (IndexedDB), Recharts, Zod, the Anthropic API with tool use and streaming, USDA FoodData Central, Vitest, and Vercel. It's a PWA with a hand-written service worker, so it installs to the home screen and opens offline.

## Run it

1. Copy `.env.example` to `.env.local` and fill in the values:
   - `APP_PASSCODE`: protects the API routes
   - `ANTHROPIC_API_KEY`: from the [Claude Console](https://console.anthropic.com)
   - `USDA_API_KEY`: free from [FoodData Central](https://fdc.nal.usda.gov/api-key-signup)
2. Run `npm install`, then `npm run dev`, and open http://localhost:3000.

The service worker only runs in production builds. To test it, run `npm run build`, then `npm start`.

`npm test` runs the unit tests, `npm run lint` runs ESLint, and `npm run icons` regenerates the app icons.

## Limitations

- It's designed for one person. The shared passcode protects API spending but isn't a multi-user login.
- Data lives in one browser's storage, so regular exports are the backup.
- Nutrition data from USDA and the web can be incomplete, and restaurant numbers are estimates.
