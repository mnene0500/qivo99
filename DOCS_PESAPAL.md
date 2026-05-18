
# PesaPal v3 Integration Guide for QIVO

This guide provides the necessary steps to enable mobile payment (M-Pesa, etc.) recharges in your QIVO application.

## 1. Prerequisites
- A **PesaPal Merchant Account** (Live or Sandbox).
- A public URL for your deployed application (IPNs will not work on `localhost`).

## 2. Environment Variables
Add the following variables to your hosting environment (Firebase App Hosting, Vercel, etc.):

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PESAPAL_CONSUMER_KEY` | Your PesaPal Consumer Key | `867...` |
| `PESAPAL_CONSUMER_SECRET` | Your PesaPal Consumer Secret | `fH1...` |
| `PESAPAL_API_BASE_URL` | API Endpoint | `https://pay.pesapal.com/v3` (Live) |
| `PESAPAL_IPN_URL` | Callback API Route | `https://your-domain.com/api/pesapal/callback` |
| `PESAPAL_CALLBACK_URL` | User Redirect Page | `https://your-domain.com/recharge` |
| `PESAPAL_IPN_ID` | Registered IPN Identity | *To be retrieved in Step 3* |

## 3. Registering your IPN (The "IPN ID")
Once your app is deployed with the variables above:
1. Log in to QIVO as an **Admin**.
2. Navigate to `/pesapal-admin`.
3. Click **"Run Diagnostics & Register"**.
4. The tool will communicate with PesaPal and register your domain.
5. It will return a `recommended_ipn_id`. 
6. **This is your IPN ID.** Copy this ID and add it to your environment variables as `PESAPAL_IPN_ID`.
7. Redeploy your app for the change to take effect.

## 4. Why is the IPN ID important?
Without the `PESAPAL_IPN_ID`, the payment checkout will open, but QIVO will **never receive the confirmation** that the user paid. The IPN ID acts as a "routing address" for PesaPal to send the digital receipt to your server's callback route.

## 5. Pricing Tiers
The coin packages are mapped in `src/app/api/pesapal/callback/route.ts`:
- KES 80 -> 500 Coins
- KES 120 -> 1000 Coins
- KES 230 -> 2000 Coins
- KES 550 -> 5000 Coins
- KES 1000 -> 10000 Coins
- KES 1800 -> 20000 Coins
