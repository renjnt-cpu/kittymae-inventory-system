# Kittymae Inventory Monitoring v2 — Frontend

Plain HTML/JS, no build step — same spirit as the old Apps Script app's Index.html. Every page loads `supabase-js` from a CDN and talks to Supabase directly (via `js/api.js`); Row Level Security on the database decides what each signed-in user can actually see or do.

## Before this works at all

1. Create the Supabase project and run the migrations in `../supabase/migrations/` (01 through 07, in order) via the Supabase SQL Editor.
2. Fill in `js/config.js` with your project's URL and anon public key (Project Settings → API in the Supabase dashboard).
3. In Supabase Auth settings, enable the Google provider and add your Google Cloud OAuth client ID/secret.
4. Add at least one row to `employees` for yourself (role `Admin`) so you're not locked out on first login — do this directly in the Supabase Table Editor or SQL Editor, the same way `bootstrapFirstAdmin()` worked in the old system.

## Deploying

This is a static site — no server, no build command. Drag the `kittymae-inventory-v2/` folder onto Netlify's deploy page, or connect it to a git repo for auto-deploy on push. Any static host works identically (Vercel, Firebase Hosting, GitHub Pages).

**After deploying**, go back to Supabase Auth settings and add your live Netlify URL to the allowed Redirect URLs list, or Google sign-in will bounce back with an error.

## Pages

- `login.html` — Google sign-in, links the account to its `employees` row.
- `dashboard.html` — branch stock table, KPI tiles, search.
- `movement.html` — Record a Movement (Stock In/Out, Damage, Missing, Returns, Adjustment/Correction). Sales and transfers are deliberately not here — see the plan's "Sales deduction" section for why.
- `transfers.html` — request/approve/ship/receive branch transfers, with discrepancy flagging.

## Never do this

Never hand-edit `inventory` or `inventory_transactions` via Supabase's own Table Editor — always go through the app (or the SQL functions in `06_functions.sql` directly, for a genuine one-off fix, using the `Correction` transaction type). Those tables are locked down from direct writes on purpose; the Table Editor is logged in as the project owner and can bypass that, which is exactly the kind of untracked edit this whole rebuild exists to prevent.
