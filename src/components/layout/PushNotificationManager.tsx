"use client"

import { useEffect } from "react"
import { useUser } from "@/firebase/auth/use-user"
import { savePushSubscriptionAction } from "@/app/actions/matchflow-actions"

/**
 * @fileOverview Manages PWA Web Push subscriptions and permissions.
 * NOTE: Actual notifications require VAPID keys set in Vercel environment variables.
 */
export function PushNotificationManager() {
  const { user } = useUser()

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return
    }

    const subscribeUser = async () => {
      try {
        const registration = await navigator.serviceWorker.ready
        
        // Request permission if not granted
        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') {
          console.warn("[Push Manager]: Permission denied or not requested.");
          return;
        }

        // Standard subscription logic
        // NEXT_PUBLIC_VAPID_PUBLIC_KEY must be provided for production alerts
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey ? urlBase64ToUint8Array(vapidPublicKey) : undefined
        })

        const subJson = subscription.toJSON()
        if (subJson.endpoint) {
          await savePushSubscriptionAction(user.id, subJson.endpoint, subJson)
        }
      } catch (err) {
        console.error("[Push Subscription Error]:", err)
      }
    }

    subscribeUser()
  }, [user?.id])

  return null
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
