"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * @fileOverview Recharge features have been removed.
 */
export default function RemovedRechargePage() {
  const router = useRouter()
  useEffect(() => { router.replace("/home") }, [router])
  return null
}
