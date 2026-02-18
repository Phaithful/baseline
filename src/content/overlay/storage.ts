export type Settings = {
  autoDraft: boolean;
  compact: boolean;
};

const KEY = "bh_settings_v1";

export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([KEY], (res) => {
      const raw = res[KEY] as Partial<Settings> | undefined;
      resolve({
        autoDraft: raw?.autoDraft ?? true,
        compact: raw?.compact ?? false
      });
    });
  });
}

export async function setSettings(next: Settings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [KEY]: next }, () => resolve());
  });
}