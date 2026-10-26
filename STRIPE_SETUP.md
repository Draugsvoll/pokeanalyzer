# Stripe test-mode setup

The app uses Stripe-hosted Checkout. Membership and credit changes are made only by verified Stripe webhooks.

## 1. Create Stripe prices

In the Stripe Dashboard, with **Test mode** enabled, create:

- Basic: recurring monthly price, `$2.99 USD` (5 eBay searches/month)
- Pro: recurring monthly price, `$5.99 USD` (unlimited eBay searches)
- 20-credit top-up: one-time price, `$3.99 USD`

Copy each `price_...` ID into the matching server variable in `.env`:

```text
STRIPE_BASIC_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_TOPUP_20_PRICE_ID=price_...
```

The backend creates Stripe Checkout Sessions and supplies success and cancellation URLs automatically. No Stripe Payment Link is required.

## 2. Add server secrets

Add the Stripe secret key and webhook signing secret to `.env`. Use test-mode values while developing. Never use a `STRIPE_SECRET_KEY` or webhook secret in a `VITE_` variable.

## 3. Forward webhooks locally

Install and authenticate the Stripe CLI, then run:

```powershell
stripe listen --forward-to localhost:3001/api/subscription/stripe/webhook
```

Copy the printed `whsec_...` signing secret to `STRIPE_WEBHOOK_SECRET`, then restart the server.

For a deployed server, add this webhook endpoint in Stripe Workbench:

```text
https://YOUR_API_DOMAIN/api/subscription/stripe/webhook
```

Subscribe to these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `refund.created`
- `charge.dispute.created`

## 4. Enable the customer portal

Activate and configure the Stripe customer portal in the Stripe Dashboard. The profile's **Manage billing** button opens this portal.

Enable Stripe's setting that limits each customer to one active subscription and redirects existing subscribers to the customer portal. The backend also enforces this, but the Dashboard setting gives users a cleaner fallback.

Only add Basic and Pro to the portal's allowed products. Plan changes are reconciled from signed webhooks; unrelated Stripe prices are rejected and create a billing-review alert.

## 5. Deploy Firestore rules

The included rules prevent browser clients from changing subscriptions, credits, payment history, Stripe IDs, or webhook records. Firebase Admin on the backend bypasses these rules.

Select the correct Firebase project and deploy them:

```powershell
firebase use --add
firebase deploy --only firestore:rules
```

## 6. Test

Run the app and server, choose a paid plan, and use Stripe's test card:

```text
4242 4242 4242 4242
```

Use any future expiry, any three-digit CVC, and a valid postal code. Confirm that the webhook updates Firestore before switching to live-mode keys and live Price IDs.

Test all of these flows:

- Free, Basic, and Pro can each purchase a 20-credit top-up.
- A scheduled cancellation keeps access until period end and still shows **Manage billing**.
- A fully canceled subscription becomes active Free while preserving unused bonus credits.
- A failed or past-due subscription can still open the billing portal but cannot spend or buy more credits until it is active again.
- A refund or dispute creates `users/{uid}/billing_alerts/{eventId}` and sets `billingReviewRequired` on the user. New purchases remain paused until you reconcile the account and set that field back to `false`; existing available credits can still be used.

Checkout and portal routes require a Firebase user with a verified email. Membership prices are checked against their expected amounts and monthly interval; the top-up price is checked against the expected one-time `$3.99 USD` amount before Stripe Checkout opens. `STRIPE_TOPUP_100_PRICE_ID` remains supported as a temporary fallback for the existing Stripe price.

Legacy no-charge mock-payment routes have been removed. Use Stripe test mode for all payment testing.

## Updating existing memberships

AI allowances remain 3 credits/month for Basic and 9 for Pro.

Before deploying, configure these backend variables with Stripe recurring monthly
USD Price IDs:

- `STRIPE_BASIC_PRICE_ID`: the new USD 2.99 Basic price.
- `STRIPE_PRO_PRICE_ID`: the new USD 5.99 Pro price.
- Keep `STRIPE_COLLECTOR_PRICE_ID` set to the previous Collector price so existing
  subscriptions and their webhook events still resolve to Basic.
- Before replacing `STRIPE_PRO_PRICE_ID`, copy its previous value into
  `STRIPE_LEGACY_PRO_PRICE_IDS` (comma-separated if there are several).

Checkout verifies the configured price's amount, currency, and monthly interval.
The old Collector price is recognized for existing subscriptions only, never used
for new Basic checkout. Configure the Stripe billing portal's available products
and prices to match the new plans as well.

Changing these variables does not change existing Stripe subscriptions' prices.
Any move to the new recurring prices must be scheduled separately in Stripe,
according to the chosen policy for existing subscribers. Keep legacy Price IDs
configured while old subscriptions or delayed webhook events can reference them.

Stored `collector` subscriptions are exposed as Basic without a database rewrite.
Basic's five-search allowance preserves spending already recorded in the current
billing period; unused signup credits remain available separately. Active or
trialing Pro subscriptions with a valid current billing period have unlimited
eBay access without spending monthly or bonus credits. Expired/inactive Pro
subscriptions lose unlimited access. Free/signup and AI credit rules are unchanged.
