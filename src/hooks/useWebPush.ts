"use client";

import { useState, useCallback, useRef } from "react";
import { logger } from "@/lib/logger";

const API_BASE = "https://api.o-sheepps.com";

export type PushState = "idle" | "requesting" | "ready" | "subscribed" | "denied" | "unsupported";

export function useWebPush() {
  const [state, setState] = useState<PushState>("idle");
  // useRef so bind() always sees the latest subscription even after re-render
  const pendingSubRef = useRef<PushSubscriptionJSON | null>(null);

  const prepare = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return false;
    }

    setState("requesting");

    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return false;
      }

      const keyRes = await fetch(`${API_BASE}/vapid-public-key`);
      const { publicKey } = await keyRes.json();

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      pendingSubRef.current = subscription.toJSON();
      setState("ready");
      return true;
    } catch (err) {
      logger.error("[WebPush] Prepare failed:", err);
      setState("idle");
      return false;
    }
  }, []);

  const bind = useCallback(async (orderId: string): Promise<boolean> => {
    const sub = pendingSubRef.current;
    if (!sub) {
      logger.warn("[WebPush] bind called but no pending subscription");
      return false;
    }

    try {
      const res = await fetch(`${API_BASE}/push-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, subscription: sub }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState("subscribed");
      pendingSubRef.current = null;
      logger.debug(`[WebPush] Bound to order ${orderId}`);
      return true;
    } catch (err) {
      logger.error("[WebPush] Bind failed:", err);
      return false;
    }
  }, []);

  const subscribe = useCallback(async (orderId: string): Promise<boolean> => {
    const ok = await prepare();
    if (!ok) return false;
    return bind(orderId);
  }, [prepare, bind]);

  return { state, prepare, bind, subscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
