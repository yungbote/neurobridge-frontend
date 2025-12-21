const scriptPromises = new Map();

function loadScriptOnce(src, id) {
  const key = id || src;
  const existing = scriptPromises.get(key);
  if (existing) return existing;

  const p = new Promise((resolve, reject) => {
    if (id && document.getElementById(id)) {
      resolve();
      return;
    }

    const el = document.createElement("script");
    if (id) el.id = id;
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed_to_load_script:${src}`));
    document.head.appendChild(el);
  });

  scriptPromises.set(key, p);
  return p;
}

function base64UrlFromBytes(bytes) {
  let binary = "";
  const len = bytes.byteLength || bytes.length || 0;
  for (let i = 0; i < len; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(input) {
  try {
    if (!input) return "";
    const cryptoObj = window.crypto;
    if (!cryptoObj?.subtle) return "";
    if (typeof TextEncoder === "undefined") return "";

    const data = new TextEncoder().encode(String(input));
    const digest = await cryptoObj.subtle.digest("SHA-256", data);
    return base64UrlFromBytes(new Uint8Array(digest));
  } catch {
    return "";
  }
}

function ensureGooglePromptParent() {
  const id = "google-one-tap-parent";
  let el = document.getElementById(id);
  if (el) return id;

  el = document.createElement("div");
  el.id = id;
  el.style.position = "fixed";
  el.style.top = "0";
  el.style.right = "0";
  el.style.zIndex = "2147483647";
  document.body.appendChild(el);
  return id;
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1];

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
    const json = atob(base64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function splitName(fullName) {
  const s = String(fullName || "").trim();
  if (!s) return { first_name: "", last_name: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

export function getFallbackNameFromIdToken(idToken) {
  const payload = decodeJwtPayload(idToken) || {};
  const first =
    payload.given_name ||
    payload.givenName ||
    payload.first_name ||
    payload.firstName ||
    "";
  const last =
    payload.family_name ||
    payload.familyName ||
    payload.last_name ||
    payload.lastName ||
    "";

  if (first || last) {
    return { first_name: String(first || ""), last_name: String(last || "") };
  }

  const full = payload.name || payload.full_name || payload.fullName || "";
  return splitName(full);
}

export async function getGoogleIdTokenWithNonce(nonce) {
  const googleClientId =
    import.meta.env.VITE_GOOGLE_OIDC_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new Error("missing VITE_GOOGLE_OIDC_CLIENT_ID");
  }
  if (!nonce) {
    throw new Error("getGoogleIdTokenWithNonce: missing nonce");
  }

  await loadScriptOnce("https://accounts.google.com/gsi/client", "google-gsi");

  const google = window.google;
  if (!google?.accounts?.id) {
    throw new Error("google_gsi_unavailable");
  }

  const nonceHash = await sha256Base64Url(nonce);
  const promptParentId = ensureGooglePromptParent();

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (err, token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        google.accounts.id.cancel?.();
      } catch {
        // ignored
      }
      if (err) reject(err);
      else resolve(token);
    };

    const timer = setTimeout(() => {
      finish(new Error("google_signin_timeout"));
    }, 60_000);

    google.accounts.id.initialize({
      client_id: googleClientId,
      nonce: nonceHash || nonce,
      prompt_parent_id: promptParentId,
      use_fedcm_for_prompt: true,
      itp_support: true,
      callback: (resp) => {
        const cred = resp?.credential;
        if (!cred) {
          finish(new Error("google_missing_credential"));
          return;
        }
        finish(null, cred);
      },
    });

    google.accounts.id.prompt((notification) => {
      if (settled || !notification) return;

      if (notification.isNotDisplayed?.()) {
        const reason = notification.getNotDisplayedReason?.() || "not_displayed";
        finish(new Error(`google_not_displayed:${reason}`));
        return;
      }

      if (notification.isSkippedMoment?.()) {
        const reason = notification.getSkippedReason?.() || "skipped";
        finish(new Error(`google_skipped:${reason}`));
        return;
      }

      if (notification.isDismissedMoment?.()) {
        const reason = notification.getDismissedReason?.() || "dismissed";
        finish(new Error(`google_dismissed:${reason}`));
      }
    });
  });
}

function randomState() {
  try {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }
}

export async function getAppleIdTokenWithNonce(nonce) {
  const appleClientId =
    import.meta.env.VITE_APPLE_OIDC_CLIENT_ID || import.meta.env.VITE_APPLE_CLIENT_ID;
  if (!appleClientId) {
    throw new Error("missing VITE_APPLE_OIDC_CLIENT_ID");
  }
  if (!nonce) {
    throw new Error("getAppleIdTokenWithNonce: missing nonce");
  }

  const redirectURI =
    import.meta.env.VITE_APPLE_REDIRECT_URI || window.location.origin;

  await loadScriptOnce(
    "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
    "appleid-auth"
  );

  const AppleID = window.AppleID;
  if (!AppleID?.auth) {
    throw new Error("apple_js_unavailable");
  }

  AppleID.auth.init({
    clientId: appleClientId,
    scope: "name email",
    redirectURI,
    state: randomState(),
    nonce,
    usePopup: true,
  });

  const resp = await AppleID.auth.signIn();
  const idToken =
    resp?.authorization?.id_token ||
    resp?.authorization?.idToken ||
    resp?.id_token ||
    null;

  if (!idToken) {
    throw new Error("apple_missing_id_token");
  }

  return { idToken, user: resp?.user || null };
}
