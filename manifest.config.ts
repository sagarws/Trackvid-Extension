import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "TrackVid",
  description:
    "Captures Myntra, Flipkart, AJIO, Snapdeal, Delhivery, Xbees, Meesho, and Nykaa seller-portal sessions after login and syncs them to TrackVid.",
  version: pkg.version,
  action: {
    default_popup: "src/popup/index.html",
    default_title: "TrackVid",
    default_icon: {
      "16": "src/assets/icon-16.png",
      "32": "src/assets/icon-32.png",
      "48": "src/assets/icon-48.png",
      "128": "src/assets/icon-128.png",
    },
  },
  icons: {
    "16": "src/assets/icon-16.png",
    "32": "src/assets/icon-32.png",
    "48": "src/assets/icon-48.png",
    "128": "src/assets/icon-128.png",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  // AJIO needs page-context reads (localStorage.activeSellerProfileId +
  // in-page fetch of the work-places API for pobIds). Myntra/Flipkart don't —
  // for them the SW's webRequest sniffing is enough.
  content_scripts: [
    {
      matches: ["https://seller.ajio.com/*"],
      js: ["src/content-scripts/ajio-page.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["cookies", "webRequest", "storage", "tabs", "notifications"],
  host_permissions: [
    "https://*.myntra.com/*",
    "https://*.myntrainfo.com/*",
    "https://seller.flipkart.com/*",
    "https://seller.ajio.com/*",
    "https://seller.snapdeal.com/*",
    "https://sellersweb.snapdeal.com/*",
    "https://one.delhivery.com/*",
    "https://ucp-auth.delhivery.com/*",
    "https://ucp-app-auth.delhivery.com/*",
    "https://ucp-app-gateway.delhivery.com/*",
    "https://clientportal.xbees.in/*",
    "https://auth.xbees.in/*",
    "https://authservice.xbees.in/*",
    "https://clientshipupdatesapi.xbees.in/*",
    "https://supplier.meesho.com/*",
    "https://dispute.nykaa.com/*",
    "https://desk.zoho.in/*",
    "https://accounts.zoho.in/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
    "https://*/*",
  ],
});
