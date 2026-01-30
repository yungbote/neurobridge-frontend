import { useEffect, useState } from "react";

let historyPatched = false;

function ensureHistoryPatched(): boolean {
  if (typeof window === "undefined") return false;
  if (historyPatched) return true;
  historyPatched = true;

  const { pushState, replaceState } = window.history;

  try {
    window.history.pushState = function (...args) {
      const result = pushState.apply(this, args as unknown as Parameters<typeof pushState>);
      window.dispatchEvent(new Event("locationchange"));
      return result;
    };

    window.history.replaceState = function (...args) {
      const result = replaceState.apply(this, args as unknown as Parameters<typeof replaceState>);
      window.dispatchEvent(new Event("locationchange"));
      return result;
    };
    return true;
  } catch {
    return false;
  }
}

export function useWindowPathname(): string {
  const [pathname, setPathname] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.location.pathname || "";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const patched = ensureHistoryPatched();

    const handle = () => setPathname(window.location.pathname || "");
    handle();

    window.addEventListener("popstate", handle);
    window.addEventListener("locationchange", handle);
    let intervalId: number | null = null;
    if (!patched) {
      intervalId = window.setInterval(handle, 500);
    }

    return () => {
      window.removeEventListener("popstate", handle);
      window.removeEventListener("locationchange", handle);
      if (intervalId != null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return pathname;
}
