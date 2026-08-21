import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "TrackVid",
  description:
    "Captures Myntra, Flipkart, and AJIO seller-portal sessions after login and syncs them to TrackVid.",
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
    "http://localhost/*",
    "http://127.0.0.1/*",
    "https://*/*",
  ],
});
