# CreatorTrack

CreatorTrack is a Next.js and Supabase creator referral dashboard. It supports creator attribution, public lead capture, commissions, manual payments, reporting, and a Google Forms webhook.

## Requirements

- Node.js 20.9 or newer
- A Supabase project (PostgreSQL and Supabase Auth)

## Run locally

1. Install packages: `npm install`
2. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable/anon key
   - `SUPABASE_SERVICE_ROLE_KEY` — server-only key required for admin creator invitations and account controls; never prefix it with `NEXT_PUBLIC_`
   - `GOOGLE_FORMS_WEBHOOK_SECRET` — optional until Google Forms is connected; generate a long random value
3. In Supabase SQL Editor, apply [`supabase/migrations/202611110001_creatortrack.sql`](./supabase/migrations/202611110001_creatortrack.sql), then [`supabase/migrations/202611130001_creator_portal_permissions.sql`](./supabase/migrations/202611130001_creator_portal_permissions.sql), in order. The second migration is additive and retains existing records.
4. Start the app: `npm run dev`
5. Open `http://localhost:3000`, create the first account, and confirm the email if email confirmation is enabled. The first registered account becomes the workspace admin. Do not use the first-admin bootstrap on a public, untrusted deployment; create it in a controlled setup window.

Supabase Auth and row-level security guard dashboard data. The browser only receives the project URL and public anon key. Never expose a service-role key in the browser or a `NEXT_PUBLIC_` variable. Apply schema changes using reviewed SQL migrations.

## Referral links and lead lifecycle

- Each creator receives the next available `REF001`, `REF002`, … code and a `General` referral link when added.
- Links open `/lead-form?ref=REF001`. The custom form validates the active referral link, records its click, and captures attribution without asking the customer to type a code.
- Create additional campaign links on **Referral Links**. A campaign form URL is `/lead-form?ref=REF001&campaign=Campaign%20Name`; the campaign name must match the link in CreatorTrack.
- Lead submissions are validated server-side and inserted through a database function. A repeated email or normalized phone is rejected, including concurrent submissions.
- Move a lead to **Qualified** or **Converted** to create its commission. A database uniqueness constraint and trigger make commission creation idempotent. Percentage commissions use the lead's `revenue_amount`; enter the sale amount on **Conversions**.
- Approve commissions on **Commissions**. On **Payments**, record the actual external payment method and reference to mark approved commissions as paid. No money is transferred by CreatorTrack.
- CSV exports are UTF-8 and Excel-compatible.

## Google Forms and Sheets integration

Google Forms does **not** automatically persist arbitrary query parameters as answers. A creator's code must be a prefilled form response or be collected by this app's custom landing page.

### Configure the form

1. Create a Google Form with questions named exactly `Customer Name`, `Email`, `Phone Number`, `Product Interested In`, `Message`, `Referral Code`, and optionally `Campaign`. Make `Referral Code` required. Do not rely on email collection alone; include the explicit `Email` question.
2. In Google Forms, use **More (⋮) → Get pre-filled link**, enter a test code such as `REF001` into the referral code question, and create the link. Copy the numeric referral `entry.<id>` and optional campaign `entry.<id>` values from the URL. Save the form URL and those entry IDs in **Settings → Google Forms and Sheets**. The **Referral Links** page then generates creator- and campaign-specific prefilled Google Form links. A creator-specific link looks like:

   `https://docs.google.com/forms/d/e/FORM_ID/viewform?usp=pp_url&entry.123456789=REF001`

   Add a prefilled Campaign answer the same way if using a campaign-specific referral link. Google Forms cannot dynamically turn an arbitrary `?ref=REF001` into a saved answer; use a prefilled response field or share CreatorTrack's `/lead-form` URL.
3. Link the form to a Google Sheet (**Responses → Link to Sheets**).
4. Open the linked Sheet, choose **Extensions → Apps Script**, and paste [`google-apps-script/Code.gs`](./google-apps-script/Code.gs).
5. In **Project Settings → Script Properties**, add:
   - `CREATORTRACK_WEBHOOK_URL`: `https://YOUR_DEPLOYMENT_HOST/api/integrations/google-form`
   - `CREATORTRACK_WEBHOOK_SECRET`: the exact value of server-side `GOOGLE_FORMS_WEBHOOK_SECRET`
6. In Apps Script **Triggers**, add an installable trigger for `onFormSubmit`, event source **From spreadsheet**, event type **On form submit**. Authorize the requested Google Sheets and external request scopes.
7. Submit a test response using a real, active creator code. Confirm the lead appears in CreatorTrack with source `Google Forms`. A duplicate email/phone returns HTTP 409 and is visible in the Apps Script execution log as a failed webhook.

The webhook validates bearer authentication in constant time, validates every field on the server, verifies the active creator/campaign through the database function, rejects duplicate leads, and never accepts a creator ID from the caller. Keep the webhook secret private and rotate it in both `.env.local`/deployment secrets and Script Properties when needed.

### Creator Portal and account permissions

- The admin can create a creator login while adding the creator, send an invitation, trigger password-reset emails, change the account email, and activate or deactivate portal access from **Creators**. Creator passwords are set directly through Supabase Auth and are never stored in CreatorTrack.
- Creators sign in at `/creator/login` and are redirected to `/creator/dashboard`. Invite and password-reset links return to the secure password setup flow on the login page.
- Each creator's **Manage dashboard access** settings are stored on their creator record. The defaults expose only their referral link, total leads, and completed clients.
- Creator dashboard statistics are served by a permission-filtered server-side database function. Customer names, emails, phone numbers, and internal notes are not returned. Direct table RLS also prevents creators from reading customer records, commissions, payments, click events, and referral-link records.
- Admin invitation/account operations require `SUPABASE_SERVICE_ROLE_KEY` configured as a server-only environment variable in local development and the hosting provider. Rotate it if exposed. Admins should retain the service-role key only in secret configuration.
- Leads without a valid creator referral are stored as direct leads. The admin overview separates creator-attributed and direct leads/conversions; total business metrics include both exactly once.
- If an existing creator account was linked manually before this migration, preserve its `auth_user_id` and `profiles` association; no account relinking is needed.

## Production and security checklist

- Use verified email and strong passwords; enable Supabase Auth rate limits and MFA for admins.
- Set the webhook secret in the hosting provider's server-only environment configuration.
- Set `SUPABASE_SERVICE_ROLE_KEY` server-side before using creator account invitation and management actions.
- Configure HTTPS and an allowed redirect URL in Supabase Auth.
- Apply RLS migration before adding real customer data. Review policies if extending tables or roles.
- Back up the Supabase database and use Supabase logs to monitor webhook failures.
- Creator role RLS limits database access. Test creator login, permission changes, account deactivation, and the admin dashboard after applying both migrations.

## Validation

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
