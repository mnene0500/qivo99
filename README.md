# QIVO Production Platform

This is the production-ready build of QIVO, optimized for Supabase and integrated with Agora RTC and Gemini AI.

## ✅ Final Production Verification

Follow these steps to confirm your Vercel-native environment is working correctly:

### 1. Verify AI Identity
*   Go to **Me > Verify Identity**.
*   Follow the instructions to take a selfie.
*   QIVO will use **Google Genkit** running natively on Vercel to confirm your biometric match with Gemini.

### 2. Check Real-time Economy
*   Perform a **Daily Check-in** in the **Task Center**.
*   Send a **Gift** in a chat.
*   Confirm that coins are deducted and diamonds are awarded instantly via Vercel Server Actions.

### 3. Premium Calling
*   Start a Video or Voice call from a profile or chat.
*   Vercel generates a secure **Agora Token** and handles per-minute billing automatically.

## 💎 Core Features
- **Secure Economy**: Coins/Diamonds managed via atomic server-side transactions.
- **Biometric Verification**: AI face-matching using Genkit and Gemini 2.5 Flash on Vercel.
- **Agora Calling**: One-on-one video/voice calls with per-minute billing and secure tokenization.
- **Agency Ecosystem**: Integrated recruitment and diamond withdrawal management.
- **Safe Community**: Multi-layered reporting, blocking, and admin control centers.

## 🛠️ Maintenance Note
All business logic runs as **Next.js Server Actions** on Vercel. If you update your API keys (Agora/Gemini), update them in **Vercel Dashboard > Settings > Environment Variables** and redeploy.# mcc
# mcc
