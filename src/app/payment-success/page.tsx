"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * @fileOverview Payment success page removed.
 */
export default function RemovedPaymentSuccessPage() {
  const router = useRouter()
  useEffect(() => { router.replace("/home") }, [router])
  return null
}
