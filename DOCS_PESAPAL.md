# PesaPal v3 LIVE Integration Guide for QIVO

This guide is specific to your production domain: **qivo-gamma.vercel.app**.

## 1. Environment Variables (Vercel Settings)
Add the following variables exactly as shown to your Vercel project environment:

| Variable | Value | 
| :--- | :--- |
| `PESAPAL_CONSUMER_KEY` | *Get this from PesaPal Live Dashboard* |
| `PESAPAL_CONSUMER_SECRET` | *Get this from PesaPal Live Dashboard* |
| `PESAPAL_API_BASE_URL` | `https://pay.pesapal.com/v3` |
| `PESAPAL_IPN_URL` | `https://qivo-gamma.vercel.app/api/pesapal/callback` |
| `PESAPAL_CALLBACK_URL` | `https://qivo-gamma.vercel.app/recharge` |
| `PESAPAL_IPN_ID` | *Retrieved in Step 2* |

## 2. Registering your Live IPN (The "IPN ID")
Once you have added the first 5 variables and redeployed:
1. Log in to QIVO as an **Admin**.
2. Go to `https://qivo-gamma.vercel.app/pesapal-admin`.
3. Click **"Run Diagnostics & Register"**.
4. The tool will talk to PesaPal Live and return a `recommended_ipn_id`. 
5. Copy that ID and add it to Vercel as `PESAPAL_IPN_ID`.
6. **Redeploy one last time.**

## 3. Deployment Check
Ensure your merchant reference prefix is set to `QV_` in `payment-actions.ts` (Already done). This helps identify QIVO transactions in your PesaPal dashboard.
