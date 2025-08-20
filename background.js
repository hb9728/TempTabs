// Background service worker: sets defaults, context menus, periodic cleanup, badge count
const DEFAULT_RETENTION_HOURS = 24;
const MAX_ITEMS = 500;

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) { return ""; }
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get(["settings"]);
  return settings || { retentionHours: DEFAULT_RETENTION_HOURS };
}

async function setSettings(settings) {
  await chrome.storage.local.set({ settings });
}

async function getTempTabs() {
  const { tempTabs } = await chrome.storage.local.get(["tempTabs"]);
  return tempTabs || [];
}

async function setTempTabs(tempTabs) {
  await chrome.storage.local.set({ tempTabs });
}

async function cleanupExpired() {
  const now = Date.now();
  let list = await getTempTabs();
  const before = list.length;
  list = list.filter(item => !item.expiresAt || item.expiresAt > now);
  if (list.length !== before) await setTempTabs(list);
  await updateBadge();
}

async function addTempTab({ url, title }) {
  const settings = await getSettings();
  const now = Date.now();
  const expiresAt = now + settings.retentionHours * 3600 * 1000;
  let list = await getTempTabs();
  if (list.length >= MAX_ITEMS) {
    list.sort((a, b) => a.addedAt - b.addedAt);
    list = list.slice(1);
  }
  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  list.push({ id, url, title: title || url, domain: domainFromUrl(url), addedAt: now, expiresAt });
  await setTempTabs(list);
  await updateBadge();
}

async function updateBadge() {
  const list = await getTempTabs();
  const now = Date.now();
  const live = list.filter(item => !item.expiresAt || item.expiresAt > now);
  const count = live.length;
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: count >= (MAX_ITEMS - 50) ? "#d33" : "#4682fa" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await getSettings();
  if (!existing || typeof existing.retentionHours !== "number") {
    await setSettings({ retentionHours: DEFAULT_RETENTION_HOURS });
  }
  chrome.contextMenus.create({ id: "tt-add-page", title: "TempTabs: Add this page", contexts: ["page"] });
  chrome.contextMenus.create({ id: "tt-add-link", title: "TempTabs: Add link", contexts: ["link"] });
  chrome.alarms.create("tt-cleanup", { periodInMinutes: 30 });
  await updateBadge();
});

chrome.runtime.onStartup.addListener(updateBadge);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "tt-add-page") {
    const url = info.pageUrl || (tab && tab.url);
    const title = (tab && tab.title) || url;
    if (url) await addTempTab({ url, title });
  }
  if (info.menuItemId === "tt-add-link") {
    const url = info.linkUrl;
    const title = info.linkText || url;
    if (url) await addTempTab({ url, title });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "tt-cleanup") {
    await cleanupExpired();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "tt:addCurrentTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const t = tabs[0];
      if (t?.url) await addTempTab({ url: t.url, title: t.title });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === "tt:cleanup") {
    cleanupExpired().then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.tempTabs) {
    updateBadge();
  }
});
