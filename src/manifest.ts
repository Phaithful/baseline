export const manifest = {
  manifest_version: 3,
  name: "Baseline Helper",
  version: "0.0.1",
  description: "Evidence-driven assistant overlay for baseline rating.",
  action: {
    default_title: "Baseline Helper"
  },
  permissions: ["storage", "tabs", "scripting"],
  host_permissions: [
    "*://baseline.apple.com/*",
    "*://*.genius.com/*",
    "*://music.apple.com/*",
    "*://*.google.com/*",
    "*://*.spotify.com/*",
    "*://open.spotify.com/*",
    "*://*.youtube.com/*",
    "*://youtube.com/*",
    "*://www.youtube.com/*",
    "*://itunes.apple.com/*",
  ],

  
  background: {
    service_worker: "background/index.js",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["https://baseline.apple.com/*"],
      js: ["content/index.js"],
      run_at: "document_idle"
    }
  ]
} as const;