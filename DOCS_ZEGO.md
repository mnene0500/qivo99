# ZegoCloud Production One-on-One Calling

## 1. Production Credentials
Go to [ZegoCloud Admin Console](https://console.zegocloud.com/) and get your App ID and Server Secret.

Add these to your **Vercel Environment Variables**:
| Variable | Value | Importance |
| :--- | :--- | :--- |
| `ZEGO_APP_ID` | Your App ID | Critical |
| `ZEGO_SERVER_SECRET` | Your Server Secret | **DO NOT PREFIX WITH NEXT_PUBLIC_** |

## 2. Real-time Calling Logic
- **Caller**: Deducted **150 coins/min** (Video) or **70 coins/min** (Voice).
- **Recipient**: Receives **Diamonds** based on their gender-reward rate (50% for females, 40% for males).
- **Server Authority**: Every minute is validated on the server. If balance runs out, the call is disconnected automatically.
- **Admin Waiver**: Users with `is_admin` or `is_coin_seller` set to `true` can call for free.

## 3. Deployment Note
After adding the environment variables to Vercel, you **MUST** trigger a new deployment for the changes to take effect on the server.

## 4. Troubleshooting
If calls fail to connect:
1. Check Vercel logs for "ZegoCloud Error".
2. Ensure `ZEGO_SERVER_SECRET` does not have any accidental spaces.
3. Verify that Supabase Realtime is enabled (for call signaling broadcast).
