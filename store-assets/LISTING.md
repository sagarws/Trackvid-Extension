# Chrome Web Store — Store listing copy

Paste-ready values for every field on the **Store listing** tab.
Assets live beside this file.

---

## Product details

### Title
Comes from `manifest.config.ts` → `name`. Currently:

    TrackVid

Limit is 75 chars. To change it, edit `name` in `manifest.config.ts`
and re-upload the ZIP — it is not editable in the dashboard.

### Summary
Comes from `manifest.config.ts` → `description`. Currently 98/132 chars:

    Captures Myntra, Flipkart, and AJIO seller-portal sessions after login and syncs them to TrackVid.

### Description

```
TrackVid Seller Session Capture connects your Myntra Partner Portal, Flipkart
Seller Hub, and AJIO Seller Central logins to your TrackVid account, so TrackVid
can pull your catalogue, order, and returns data without you re-entering a
password or an OTP every time.

HOW IT WORKS

1. Install the extension and open it from the Chrome toolbar.
2. Enter your TrackVid email and password (or your TrackVid user ID) and click
   Verify. This signs you in to TrackVid — not to any seller portal.
3. Log in to Myntra, Flipkart, or AJIO in the same browser exactly as you
   normally would, including OTP or 2FA.
4. The moment the login succeeds, the extension reads that portal's session
   cookies and sends them to your TrackVid account over HTTPS.
5. The popup lists every seller account linked to your TrackVid company, when
   each session was captured, and when it expires — so you can see at a glance
   which accounts need a fresh login.

WHAT IT DOES

• Detects a completed seller-portal login automatically. No copy-pasting cookies,
  no developer tools, no manual export.
• Supports three portals: Myntra (partner and vendor logins), Flipkart Seller Hub
  (including the CSRF token its APIs require), and AJIO Seller Central (including
  the seller profile and point-of-business IDs its APIs require).
• Shows a live status for each linked seller account: captured, synced, expiring,
  or expired.
• Re-sync on demand if a sync fails while you are offline.
• Optional secure mode holds a capture locally and only uploads it after you
  close the popup.

WHAT DATA IT HANDLES

This extension exists to move seller-portal session cookies to TrackVid, and we
want to be explicit about that:

• It reads session cookies for myntra.com, myntrainfo.com, seller.flipkart.com,
  and seller.ajio.com — and only those domains — after a login on those sites
  completes.
• It sends those cookies, plus the signed-in seller username, to the TrackVid
  backend over HTTPS.
• It stores your TrackVid email and access token in Chrome's local extension
  storage so you do not have to sign in on every use. Your TrackVid password is
  only kept if you tick "Save password".
• It does not read cookies, browsing history, or page content from any other
  website.
• It does not show ads, inject content into pages you browse, or sell or share
  any data with third parties.

WHO IT IS FOR

TrackVid customers running catalogue and order operations across Indian
marketplaces. A TrackVid account is required — the extension does nothing on its
own without one.

Questions or trouble linking an account: <SUPPORT EMAIL / URL>
```

Character count: 2,609 of 16,000.

Replace `<SUPPORT EMAIL / URL>` before pasting.

### Category
**Workflow & Planning**

It is a business-operations connector, not a consumer shopping tool. "Shopping"
reads as a deal/coupon extension to reviewers and would be a worse fit.

### Language
**English (United States)** — the whole UI is English. Add other languages only
if you actually ship `_locales`.

---

## Graphic assets

| Field | Spec | File |
|---|---|---|
| Store icon | 128 × 128 PNG | `store-icon-128.png` |
| Screenshot | 1280 × 800 or 640 × 400, JPEG or 24-bit PNG, no alpha | **not generated — see below** |
| Small promo tile | 440 × 280, JPEG or 24-bit PNG, no alpha | `promo-small-440x280.jpg` |
| Marquee promo tile | 1400 × 560, JPEG or 24-bit PNG, no alpha | `promo-marquee-1400x560.jpg` |
| Promo video | YouTube URL | optional — leave blank |

All three generated files are flattened (no alpha channel) and built from
`Image/squre_logo.svg` and `Image/logo_with_name.svg`. The `_source-*.svg` files
regenerate them.

### Screenshots (required — at least one)
These need the real popup, which needs a signed-in TrackVid account, so they
could not be generated here. Suggested set of 4, each a 1280 × 800 frame with the
popup screenshot centred on a light background plus a one-line caption:

1. **Home, verified, accounts listed** — "See every linked seller account and when
   its session expires"
2. **A capture landing** — "Log in as normal. The session is captured the moment
   login succeeds"
3. **Settings / Verify** — "Sign in once with your TrackVid account"
4. **Home, unverified** — "Set up in under a minute"

To capture: open the popup, right-click → Inspect, then in the DevTools window
use Ctrl/Cmd-Shift-P → "Capture screenshot".

---

## Additional fields

| Field | Value |
|---|---|
| Official URL | `https://trackvid.in` — only selectable after you verify the domain in Google Search Console with the same account |
| Homepage URL | `https://trackvid.in` |
| Support URL | `https://trackvid.in/support` (or your contact page — must be an http/https URL, not a mailto) |
| Mature content | **No** |

Domain inferred from the backend host `api.trackvid.in` — confirm the real
marketing URL before submitting.

---

## Before you hit Submit

Two things on other tabs will block or sink the review.

### 1. Narrow the host permissions
`manifest.config.ts` currently requests:

```
"https://*/*",        ← every website on the internet
"http://localhost/*", ← dev only
"http://127.0.0.1/*"  ← dev only
```

An extension that reads authentication cookies AND asks for all-URLs access is
close to a guaranteed rejection under the "request the narrowest permissions"
policy. Drop all three and add your API host:

```
host_permissions: [
  "https://*.myntra.com/*",
  "https://*.myntrainfo.com/*",
  "https://seller.flipkart.com/*",
  "https://seller.ajio.com/*",
  "https://api.trackvid.in/*",
],
```

### 2. Privacy tab — required, and reviewed closely
- **Single purpose**: "Capture the user's own Myntra, Flipkart, and AJIO seller-portal
  session after login and sync it to their TrackVid account."
- **Privacy policy URL**: mandatory, because the extension handles authentication
  information. It must state what cookies are collected, where they are sent, how
  long they are retained, and how to delete them.
- **Data usage disclosures**: tick **Authentication information** and **Personally
  identifiable information** (email). Then certify: not sold to third parties, not
  used for unrelated purposes, not used for creditworthiness/lending.
- **Permission justifications**:
  - `cookies` — read seller-portal session cookies after the user logs in, so the
    session can be synced to their TrackVid account.
  - `webRequest` — detect when a seller-portal login request completes, which is
    the trigger for a capture.
  - `storage` — store the user's TrackVid credentials and the last capture locally.
  - `tabs` — find the open AJIO Seller Central tab to read its post-login profile IDs.
  - `notifications` — tell the user when a capture succeeds or fails.
  - Host permissions — limited to the three seller portals the extension supports
    and the TrackVid API it syncs to.

### 3. Consider Unlisted visibility
This is a tool for existing TrackVid customers, not the public. **Unlisted** still
gets reviewed but is install-by-link only and keeps a cookie-syncing extension out
of public search results. **Private** (Workspace domain or trusted testers) is
tighter still if all users share a domain.
