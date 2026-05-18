"use client";

import { useState, useCallback } from "react";

const API_BASE = "https://api.o-sheepps.com";

export type PushState = "idle" | "requesting" | "ready" | "subscribed" | "denied" | "unsupported";

export function useWebPush() {
  const [state, setState] = useState<PushState>("idle");
  const [pendingSubscription, setPendingSubscription] = useState<PushSubscriptionJSON | null>(null);

  // Step 1: 请求权限 + 注册 SW + 获取 subscription（不需要 orderId）
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

      setPendingSubscription(subscription.toJSON());
      setState("ready");
      return true;
    } catch (err) {
      console.error("[WebPush] Prepare failed:", err);
      setState("idle");
      return false;
    }
  }, []);

  // Step 2: 订单创建成功后，把 subscription 绑定到 orderId
  const bind = useCallback(async (orderId: string): Promise<boolean> => {
    const sub = pendingSubscription;
    if (!sub) return false;

    try {
      await fetch(`${API_BASE}/push-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, subscription: sub }),
      });
      setState("subscribed");
      return true;
    } catch (err) {
      console.error("[WebPush] Bind failed:", err);
      return false;
    }
  }, [pendingSubscription]);

  // 兼容旧接口：一步完成（需要 orderId）
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
