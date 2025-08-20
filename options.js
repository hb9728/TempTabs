async function getSettings() {
  const { settings, tempTabs } = await chrome.storage.local.get(["settings", "tempTabs"]);
  const defaults = { retentionHours: 24, popupWidth: 400 };
  return { settings: Object.assign({}, defaults, settings || {}), tempTabs: tempTabs || [] };
}
async function setSettings(partial) {
  const { settings } = await getSettings();
  const next = Object.assign({}, settings, partial);
  await chrome.storage.local.set({ settings: next });
}

function setSelectValue(id, value) {
  const sel = document.getElementById(id);
  for (const opt of sel.options) {
    if (String(opt.value) === String(value)) { sel.value = opt.value; break; }
  }
}

async function load() {
  const { settings } = await getSettings();
  setSelectValue("retention", settings.retentionHours || 24);
  setSelectValue("popupWidth", settings.popupWidth || 400);
}

async function save() {
  const retention = Number(document.getElementById("retention").value || 24);
  const popupWidth = Number(document.getElementById("popupWidth").value || 400);
  await setSettings({ retentionHours: retention, popupWidth });
  alert("Saved");
}

async function exportJson() {
  const { tempTabs } = await getSettings();
  const blob = new Blob([JSON.stringify(tempTabs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "temptabs-export.json"; a.click();
  URL.revokeObjectURL(url);
}

async function wipe() {
  if (!confirm("Delete all saved items?")) return;
  await chrome.storage.local.set({ tempTabs: [], manualOrder: [] });
  alert("Deleted");
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  document.getElementById("save").addEventListener("click", save);
  document.getElementById("export").addEventListener("click", exportJson);
  document.getElementById("wipe").addEventListener("click", wipe);
});