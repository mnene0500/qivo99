"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * @fileOverview PesaPal Admin removed.
 */
export default function RemovedPesaPalAdminPage() {
  const router = useRouter()
  useEffect(() => { router.replace("/home") }, [router])
  return null
}
