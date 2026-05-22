# QIVO Production Platform

This is the production-ready build of QIVO, optimized for Supabase and integrated with PesaPal, ZegoCloud, and Gemini AI.

## ✅ Final Production Verification

Since you have finished deploying the Edge Functions and SQL, follow these steps to confirm everything is working correctly:

### 1. Test Payment Fulfillment
*   Go to **Me > Recharge**.
*   Select a package and click **Pay**.
*   In the simulator, follow the checkout process.
*   Once redirected back, the app should "suddenly" update your balance.

### 2. Verify AI Identity
*   Go to **Me > Verify Identity**.
*   Follow the instructions to take a selfie.
*   The `ai-ops` Edge Function will confirm your biometric match with Gemini.

### 3. Check Real-time Economy
*   Perform a **Daily Check-in** in the **Task Center**.
*   Send a **Gift** in a chat.
*   Confirm that coins are deducted and diamonds are awarded instantly via `economy-ops`.

## 💎 Core Features
- **Secure Economy**: Coins/Diamonds managed via atomic server-side transactions.
- **Biometric Verification**: AI face-matching using Genkit and Gemini 2.5 Flash.
- **Premium Calling**: One-on-one video/voice calls with per-minute billing.
- **Agency Ecosystem**: Integrated recruitment and diamond withdrawal management.
- **Safe Community**: Multi-layered reporting, blocking, and admin control centers.

## 🛠️ Maintenance Note
If you update your API keys (PesaPal/Zego), remember to update them in **Supabase Dashboard > Edge Functions > Secrets** and redeploy the affected function.
