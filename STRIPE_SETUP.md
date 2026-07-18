# Stripe test-mode setup

The app uses Stripe-hosted Checkout. Membership and credit changes are made only by verified Stripe webhooks.

## 1. Create Stripe prices

In the Stripe Dashboard, with **Test mode** enabled, create:

- Collector: recurring monthly price, `79 NOK`
- Pro: recurring monthly price, `149 NOK`
- 50-credit top-up: one-time price, `$5 USD`

Copy each `price_...` ID into the matching server variable in `.env`:

```text
STRIPE_COLLECTOR_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_TOPUP_50_PRICE_ID=price_...
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

Only add Collector and Pro to the portal's allowed products. Plan changes are reconciled from signed webhooks; unrelated Stripe prices are rejected and create a billing-review alert.

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

- Free, Collector, and Pro can each purchase a 50-credit top-up.
- A scheduled cancellation keeps access until period end and still shows **Manage billing**.
- A fully canceled subscription becomes active Free while preserving unused bonus credits.
- A failed or past-due subscription can still open the billing portal but cannot spend or buy more credits until it is active again.
- A refund or dispute creates `users/{uid}/billing_alerts/{eventId}` and sets `billingReviewRequired` on the user. New purchases remain paused until you reconcile the account and set that field back to `false`; existing available credits can still be used.

Checkout and portal routes require a Firebase user with a verified email. Membership prices are checked against their expected NOK amounts and monthly interval; the top-up price is checked against the expected one-time `$5 USD` amount before Stripe Checkout opens.

Legacy no-charge mock-payment routes have been removed. Use Stripe test mode for all payment testing.
