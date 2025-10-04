// Placeholder for future external API orchestration if needed.
// Currently, analysis runs locally in popup via modules.

chrome.runtime.onInstalled.addListener(() => {
  // Initialize settings
  chrome.storage.local.set({ settings: { telemetry: false } });
});
