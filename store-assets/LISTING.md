# Chrome Web Store submission — TrackVid

Everything needed for the **Store listing** tab, plus the two other tabs that
gate publishing. Assets are in this folder.

---

# 1. Product details

## Title (read-only — from package)
`TrackVid` — comes from `manifest.config.ts` → `name`. To change it, edit the
manifest and re-upload the ZIP.

## Summary (read-only — from package)
`Captures Myntra, Flipkart, and AJIO seller-portal sessions after login and syncs them to TrackVid.`
98 / 132 characters.

## Description  *(paste this)*

```
TrackVid Seller Session Capture links your Myntra, Flipkart, and AJIO seller
accounts to TrackVid, so TrackVid can keep pulling your catalogue, order, and
returns data without you re-entering a password or an OTP every day.

HOW IT WORKS

1. Install the extension and open it from the Chrome toolbar.
2. Enter your TrackVid email and password and click Verify. This signs you in to
   TrackVid — not to any seller portal.
3. Log in to Myntra, Flipkart, or AJIO in the same browser exactly as you
   normally would, OTP and 2FA included.
4. The moment that login succeeds, the extension reads the portal's session
   cookies and sends them to your TrackVid account over HTTPS.
5. The popup shows the live status of the last capture — watching, capturing,
   syncing, synced, or failed — with a Re-sync button if a sync did not go
   through.

WHY YOU WOULD WANT IT

• No manual cookie exports. No developer tools. No sharing your seller-portal
  password with anyone, including TrackVid.
• Your login stays exactly as it is today, OTP and two-factor included. The
  extension only reacts after you have logged in successfully.
• Works across three portals: Myntra, Flipkart Seller Hub, and AJIO Seller
  Central.
• Auto-sync can be switched off if you would rather hold a capture and send it
  yourself.
• One TrackVid sign-in is remembered, so day-to-day there is nothing to do
  except log in to the marketplace as usual.

WHAT DATA IT HANDLES

The whole point of this extension is to move seller-portal session cookies to
TrackVid, so we want to be blunt about what that means:

• It reads session cookies for myntra.com, myntrainfo.com, seller.flipkart.com,
  and seller.ajio.com — and no other site — after a login on those sites
  completes.
• It sends those cookies, plus the seller username they belong to, to the
  TrackVid backend over HTTPS.
• It stores your TrackVid email and access token in Chrome's local extension
  storage so you are not asked to sign in every time. Your TrackVid password is
  saved only if you tick "Save password on this device".
• It does not read cookies, browsing history, or page content from any other
  website.
• It shows no ads, injects nothing into the pages you browse, and shares no data
  with third parties.

WHO IT IS FOR

TrackVid customers running catalogue and order operations across Indian
marketplaces. A TrackVid account is required — the extension does nothing
without one.

Trouble linking an account: <SUPPORT EMAIL OR URL>
```

2,483 / 16,000 characters. Replace `<SUPPORT EMAIL OR URL>` before pasting.

## Category
**Workflow & Planning**

It is a business-operations connector. "Shopping" reads as a coupon/deal
extension to reviewers and fits worse.

## Language
**English (United States)** — the UI ships English only. Add more languages only
if you actually ship `_locales`.

---

# 2. Graphic assets

| Field | Spec | File |
|---|---|---|
| Store icon | 128 × 128 PNG | `store-icon-128.png` |
| Screenshots (≥1, max 5) | 1280 × 800, no alpha | `screenshot-1-1280x800.jpg` … `screenshot-4-1280x800.jpg` |
| Small promo tile | 440 × 280, no alpha | `promo-small-440x280.jpg` |
| Marquee promo tile | 1400 × 560, no alpha | `promo-marquee-1400x560.jpg` |
| Promo video | YouTube URL | leave blank |

Upload the screenshots in numbered order — they read as a sequence:

1. Set up in under a minute *(unverified home)*
2. One sign-in, then it runs itself *(configuration screen)*
3. Log in to the portal exactly as you do today *(watching)*
4. The session reaches TrackVid instantly *(synced)*

Every file is flattened (no alpha) and sized exactly to spec. The popup images
are real renders of the shipped screens — captured from `screenshots/demo.html`
with `VITE_DEV_MODE` off, so they match what a public user actually sees. The
seller name shown, `northlight-retail`, is placeholder demo data.

`_source-*.svg` regenerates any tile or screenshot frame.

Marquee tile note: it is only shown if Google features you on the store home
page. Harmless to upload, never required.

---

# 3. Additional fields

| Field | Value |
|---|---|
| Official URL | `https://trackvid.in` — selectable only after you verify the domain in Google Search Console under the same Google account |
| Homepage URL | `https://trackvid.in` |
| Support URL | `https://trackvid.in/support` — must be http/https, a `mailto:` is rejected |
| Mature content | **Off** |

The domain is inferred from your API host `api.trackvid.in`. Confirm the real
marketing URL before submitting. If no support page exists yet, point Support URL
at your contact page — leaving it blank is allowed but costs you review goodwill.

---

# 4. Deployment guide

## Step 0 — Fix the manifest first *(do this before anything else)*

`manifest.config.ts` currently asks for:

```
"http://localhost/*",  ← development only
"http://127.0.0.1/*",  ← development only
"https://*/*"          ← every website that exists
```

An extension that reads authentication cookies **and** requests all-URLs access
is the single most common rejection under Chrome's "request the narrowest
permissions" policy. The service worker only ever touches the four seller-portal
hosts and your own API, so replace the block with:

```ts
host_permissions: [
  "https://*.myntra.com/*",
  "https://*.myntrainfo.com/*",
  "https://seller.flipkart.com/*",
  "https://seller.ajio.com/*",
  "https://api.trackvid.in/*",
],
```

Then `npm run build` and re-zip. If you already uploaded a package with
`https://*/*`, upload a corrected one before you submit for review.

Also consider bumping `version` in `package.json` from `0.1.0` to `1.0.0`. Not
required, but `0.x` signals pre-release to reviewers.

## Step 1 — Package

```bash
npm run build
cd dist && zip -r ../trackvid-extension.zip . && cd ..
```

Zip the **contents** of `dist/`, not the `dist` folder itself — `manifest.json`
must sit at the root of the archive.

## Step 2 — Developer account
- One-time USD 5 registration fee at the Chrome Web Store Developer Dashboard.
- Verify your contact email. Unverified accounts cannot publish.

## Step 3 — Store listing tab
Paste sections 1–3 above.

## Step 4 — Privacy tab *(this is what gets you rejected, not the listing)*

- **Single purpose**:
  "Capture the user's own Myntra, Flipkart, and AJIO seller-portal session after
  they log in, and sync it to their TrackVid account."

- **Permission justifications** — one line each, they are all required:
  - `cookies` — read the seller-portal session cookies after the user completes a
    login, so the session can be synced to their TrackVid account.
  - `webRequest` — detect when a seller-portal login request completes; that is
    the trigger for a capture.
  - `storage` — keep the user's TrackVid sign-in and the last capture locally.
  - `tabs` — locate the open AJIO Seller Central tab to read the seller profile
    IDs its API needs.
  - `notifications` — tell the user when a capture succeeded or failed.
  - **Host permissions** — limited to the three supported seller portals and the
    TrackVid API the sessions are synced to.

- **Data usage** — tick **Authentication information** and **Personally
  identifiable information** (email). Then certify all three boxes: not sold to
  third parties, not used for anything unrelated to the single purpose, not used
  for creditworthiness or lending.

- **Privacy policy URL** — mandatory here, because the extension handles
  authentication information. It must state what is collected (seller-portal
  session cookies, TrackVid email), where it is sent (api.trackvid.in), how long
  it is kept, and how a user deletes it. A listing without this is rejected
  automatically, not by a human.

## Step 5 — Distribution tab

Pick visibility deliberately:

| Option | Fits when |
|---|---|
| **Public** | anyone may install; listed in store search |
| **Unlisted** *(recommended)* | install by direct link only, still reviewed, kept out of public search — right for a tool only your customers use |
| **Private** | restricted to a Google Workspace domain or a trusted-tester list |

An extension that syncs session cookies has little to gain from public search
and a lot to lose from casual installs. Unlisted is the sensible default here.

## Step 6 — Submit

Review is typically a few days, and longer for anything touching authentication
data. Expect a possible follow-up email asking you to justify the `cookies` and
`webRequest` permissions — answer with the single-purpose sentence above.

## Common rejection reasons for this specific extension

1. **Broad host permissions** — fixed in Step 0.
2. **Missing or vague privacy policy** — the extension handles auth data, so the
   policy must name the cookies and the destination host.
3. **Listing does not disclose the data flow** — the "WHAT DATA IT HANDLES"
   section of the description exists for exactly this reason. Do not trim it.
4. **Screenshots that do not show the real product** — the supplied ones are real
   renders of the shipped UI, so this is covered.
