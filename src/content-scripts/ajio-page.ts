// -----------------------------------------------------------------------------
// AJIO page reader — runs inside seller.ajio.com and forwards two pieces of
// state the service worker can't get on its own:
//
//   1. `activeSellerProfileId` from localStorage (the seller's userId; every
//      AJIO API URL is templated on it).
//   2. The seller's work-places (PoB ids + store names) via an in-page fetch
//      to /malekith/nickfury/v1/sellers/{userId}/work-places. This fetch is
//      same-origin, uses the browser's own cookies, and passes Akamai — a
//      request from anywhere else would be blocked.
//
// The SW picks this up in onLoginDetected for AJIO and folds userId + pobIds
// into the ingest payload. Without it the AJIO capture would land with cookies
// only, which the BE ingest endpoint refuses (userId + pobIds are required).
//
// Polling: `activeSellerProfileId` is written by the SPA after the SSO
// callback, not the moment the page loads. So we poll for up to 15s, then give
// up and stay silent (the SW will still capture cookies and mark the session
// incomplete rather than sending a broken payload).
// -----------------------------------------------------------------------------

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface WorkPlaceResponse {
  content?: Array<{ id?: string; storeName?: string }>;
  totalPages?: number;
  last?: boolean;
}

function readSellerUserId(): string | null {
  try {
    const direct = window.localStorage.getItem("activeSellerProfileId");
    if (direct && GUID_RE.test(direct)) {
      const m = direct.match(GUID_RE);
      return m ? m[0] : null;
    }
    // Fallback: scan every value in local + session storage for the first GUID.
    const blobs: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) blobs.push(window.localStorage.getItem(k) || "");
    }
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k) blobs.push(window.sessionStorage.getItem(k) || "");
    }
    for (const b of blobs) {
      const m = b.match(GUID_RE);
      if (m) return m[0];
    }
  } catch {
    /* storage access disallowed — non-fatal */
  }
  return null;
}

async function fetchWorkPlaces(
  userId: string
): Promise<{ pobIds: string[]; stores: { id: string; storeName?: string }[] }> {
  const all: { id: string; storeName?: string }[] = [];
  let pageNum = 0;
  const size = 100;
  // Guard against runaway pagination.
  for (let guard = 0; guard < 20; guard++) {
    const url = `/malekith/nickfury/v1/sellers/${userId}/work-places?workPlaceType=POB&page=${pageNum}&size=${size}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json", "X-Tenant": "AJIO" },
        credentials: "include",
      });
    } catch {
      break; // network / CORS — return what we have
    }
    if (!res.ok) break;
    let json: WorkPlaceResponse;
    try {
      json = (await res.json()) as WorkPlaceResponse;
    } catch {
      break;
    }
    const content = json.content || [];
    for (const c of content) {
      if (c && typeof c.id === "string") all.push({ id: c.id, storeName: c.storeName });
    }
    if (
      json.last === true ||
      content.length < size ||
      json.totalPages == null ||
      pageNum >= json.totalPages - 1
    ) {
      break;
    }
    pageNum++;
  }
  return { pobIds: all.map((s) => s.id), stores: all };
}

async function collectAndSend(): Promise<void> {
  const deadline = Date.now() + 15_000;
  let userId = readSellerUserId();
  while (!userId && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    userId = readSellerUserId();
  }
  if (!userId) return; // SW will treat AJIO capture as cookies-only and refuse to send

  const { pobIds, stores } = await fetchWorkPlaces(userId);
  if (pobIds.length === 0) return; // Same: refuse rather than send an unusable jar

  try {
    await chrome.runtime.sendMessage({
      type: "AJIO_PAGE_STATE",
      userId,
      pobIds,
      stores,
      capturedAt: new Date().toISOString(),
    });
  } catch {
    /* SW may be reloading — the SW re-requests on demand via AJIO_QUERY_PAGE_STATE */
  }
}

// Push on load — the SW may already have seen the login POST and be waiting.
void collectAndSend();

// SW-triggered re-collection: the SW asks the tab to refresh page state when a
// login is detected but no message has landed yet.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "AJIO_QUERY_PAGE_STATE") return false;
  (async () => {
    const userId = readSellerUserId();
    if (!userId) {
      sendResponse({ userId: null, pobIds: [], stores: [] });
      return;
    }
    const { pobIds, stores } = await fetchWorkPlaces(userId);
    sendResponse({ userId, pobIds, stores });
  })();
  return true; // async response
});
