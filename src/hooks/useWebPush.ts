"use client";

import { useState, useCallback } from "react";

const API_BASE = "https://api.o-sheepps.com";

export type PushState = "idle" | "requesting" | "subscribed" | "denied" | "unsupported";

export function useWebPush() {
  const [state, setState] = useState<PushState>("idle");

  const subscribe = useCallback(async (orderId: string): Promise<boolean> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return false;
    }

    setState("requesting");

    try {
      // 注册 Service Worker
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 请求通知权限
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return false;
      }

      // 从服务器拿 VAPID 公钥
      const keyRes = await fetch(`${API_BASE}/vapid-public-key`);
      const { publicKey } = await keyRes.json();

      // 订阅 Push
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 把订阅发给服务器，绑定到 orderId
      await fetch(`${API_BASE}/push-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, subscription: subscription.toJSON() }),
      });

      setState("subscribed");
      return true;
    } catch (err) {
      console.error("[WebPush] Subscribe failed:", err);
      setState("idle");
      return false;
    }
  }, []);

  return { state, subscribe };
}

// Base64URL → Uint8Array（VAPID key 格式转换）
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
