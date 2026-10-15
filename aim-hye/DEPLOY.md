# Hosting the portfolio demo (Vercel + Turso, both free)

This puts a **demo** of the platform online for your CV. It is not the live business.
- **Payments:** test mode only.
- **Login codes:** shown on screen instead of sent by SMS.
- **Demo banner:** shown on every page.

| Piece | Service | Why |
|---|---|---|
| The website (Next.js) | **Vercel**, Hobby plan (free) | Made by the Next.js team: connect the GitHub repo and every push to `main` redeploys. The Hobby plan is for **non-commercial** use, which fits a portfolio demo. A real business site needs Vercel Pro or a VPS. |
| The database | **Turso** (free tier) | Vercel can't keep changes to files, so `prisma/dev.db` would lose every order. Turso hosts the same SQLite/libSQL database online, and the app already uses the libSQL driver. Setting two variables switches it over (`src/lib/libsqlConfig.ts`). |

---

## 1. Create the Turso database (about 5 minutes)

1. Sign up at **https://turso.tech** with GitHub.
2. Create a database, e.g. `aim-hye-demo`. Pick the region closest to Nigeria that's offered (e.g. Frankfurt or London).
3. Copy two values:
   - the **Database URL**, which looks like `libsql://aim-hye-demo-<you>.turso.io`;
   - an **auth token**: on the database page, choose **Create Token** with read and write access.

   *Keep the token secret.* It's a password to the database. Never commit it or paste it in chat.

## 2. Create the tables and the demo data (from your PC)

In PowerShell, inside the `aim-hye` folder. Run `git pull` first, so you have the latest scripts:
```powershell
git pull
npm install
$env:TURSO_DATABASE_URL = "libsql://aim-hye-demo-<you>.turso.io"
$env:TURSO_AUTH_TOKEN   = "<the token>"
$env:SEED_ADMIN_PASSWORD   = "<choose a strong admin password>"
$env:SEED_MANAGER_PASSWORD = "<choose a manager password>"
npm run db:migrate:turso     # creates the tables (safe to run again: skips what's already done)
npm run seed                 # adds the 116 products, 4 breweries and the staff accounts
```
**If it fails:** the script prints the reason.
- *Connection/401 errors:* the URL or token is wrong, or wasn't set in **this** PowerShell window. Settings made
  with `$env:` disappear when the window closes.
- *"already has N tables":* an earlier attempt stopped halfway. Run `npm run db:migrate:turso -- --reset` to
  wipe it and start clean. **Only do this on the demo database:** it deletes everything in it.

*Why from your PC:* this runs once. Doing it in the Vercel build would re-run it on every deploy.

## 3. Deploy on Vercel (about 5 minutes)

1. Sign up at **https://vercel.com** with GitHub, then choose **Add New → Project** and import the
   `Aim-Hye-Integrated-Concepts-Ltd` repo.
2. Set **Root Directory** to **`aim-hye`**. The app lives in that subfolder, not at the repo root.
3. Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | from step 1 |
| `TURSO_AUTH_TOKEN` | from step 1 |
| `NEXTAUTH_SECRET` | a long random string. In PowerShell: `[Convert]::ToBase64String((1..32 \| % {Get-Random -Max 256}))` |
| `DEMO_MODE` | `true` |
| `PAYSTACK_SECRET_KEY` | your Paystack **test** secret key (`sk_test_...`), or leave it out (checkout then shows an error) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | your Paystack **test** public key (`pk_test_...`) |

4. Click **Deploy**. When it finishes you get a URL like `https://aim-hye-xxxx.vercel.app`.
5. Add these three as well, using that URL, then choose **Deployments → ⋯ → Redeploy**:

| Name | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://aim-hye-xxxx.vercel.app` | Used for SEO links, the sitemap and robots.txt |
| `NEXT_PUBLIC_ORIGIN` | `https://aim-hye-xxxx.vercel.app` | Passkeys only work on the exact address they were made for |
| `NEXT_PUBLIC_RP_ID` | `aim-hye-xxxx.vercel.app` (no `https://`) | Same reason |

*Why redeploy:* `NEXT_PUBLIC_` values are baked in when the site is built.

## 4. Check it works

- **Home page:** shows the yellow demo banner and the products.
- **Customer sign-up:** go to **/account/register** and sign up with any phone number. The code appears on screen and is filled in for you.
- **Admin:** go to **/login** and sign in as `admin@aimhye.com` with your `SEED_ADMIN_PASSWORD`.
- **Test payment** (if you added the keys): use Paystack's test card `4084 0840 8408 4081`, any future expiry date, CVV `408`.

## What never to do on this demo

- **Don't set real (live) Paystack keys** while `DEMO_MODE=true`.
- **Don't use it for real customers.** With `DEMO_MODE=true`, anyone can receive a login code for any phone number.
- **Don't commit `.env` files or database files.** `.gitignore` now blocks `prisma/dev.db`.

## Turning it into the real business site later

1. Move to **Vercel Pro**, or a VPS (see "Production Deployment" in README.md).
2. Remove `DEMO_MODE`.
3. Connect an SMS provider (e.g. Termii) in `src/lib/otp.ts` → `sendOTPSMS`.
4. Use **live** Paystack keys and set the Paystack webhook URL to `https://<domain>/api/payment/webhook`.
5. Use a real domain.
