import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "TrackVid — Myntra Session Capture",
  description:
    "Captures Myntra partner-portal session cookies after login and syncs them to TrackVid.",
  version: pkg.version,
  action: {
    default_popup: "src/popup/index.html",
    default_title: "TrackVid",
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
  permissions: ["cookies", "webRequest", "storage", "tabs", "notifications"],
  host_permissions: [
    "https://*.myntra.com/*",
    "https://*.myntrainfo.com/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
    "https://*/*",
  ],
});
