async function setItemExpiry(id, choice, settings) {
  const { tempTabs } = await chrome.storage.local.get(["tempTabs"]);
  const list = (tempTabs || []).slice();
  const idx = list.findIndex(i => i.id === id);
  if (idx === -1) return;

  const base = typeof list[idx].addedAt === "number" ? list[idx].addedAt : Date.now(); // anchor to creation time
  const defHours = (settings && settings.retentionHours) || 24;

  if (choice === "never") {
    delete list[idx].expiresAt; // pinned: no auto-expiry
    list[idx].expiryPreset = "never";
  } else if (choice === "default") {
    list[idx].expiresAt = base + defHours * 3600000; // from addedAt using default hours
    list[idx].expiryPreset = "default";
  } else {
    const hrs = Number(choice);
    if (!Number.isNaN(hrs) && hrs > 0) {
      list[idx].expiresAt = base + hrs * 3600000; // from addedAt using selected hours
      list[idx].expiryPreset = String(hrs);
    }
  }

  await chrome.storage.local.set({ tempTabs: list });
}

async function load() {
  const { tempTabs, settings, sortMode, manualOrder, hideExpired } = await chrome.storage.local.get([
    "tempTabs",
    "settings",
    "sortMode",
    "manualOrder",
    "hideExpired",
  ]);

  const now = Date.now();
  const all = tempTabs || [];

  // Live count (regardless of toggle)
  const totalLive = all.filter((i) => !i.expiresAt || i.expiresAt > now).length;

  // Apply search first
  let view = state.filter ? all.filter((i) => matchesQuery(i, state.filter)) : all;

  // Hide expired toggle (default: hide when undefined)
  const hide = hideExpired !== false;
  if (hide) {
    view = view.filter((i) => !i.expiresAt || i.expiresAt > now);
  }

  const sorted = sortList(view, sortMode || "newest", manualOrder || []);
  render(sorted, { editMode: state.editMode, settings, sortMode: sortMode || "newest", totalLive });

  const sortSel = document.getElementById("sortSelect");
  if (sortSel) sortSel.value = sortMode || "newest";

  const searchEl = document.getElementById("searchInput");
  if (searchEl) searchEl.value = state.filter;

  const toggle = document.getElementById("hideExpiredToggle");
  if (toggle) {
    toggle.checked = hide;
    toggle.onchange = async (e) => {
      await chrome.storage.local.set({ hideExpired: e.target.checked });
      await load();
    };
  }
}

function render(list, { editMode = false, settings, sortMode, totalLive }) {
  const main = document.getElementById("list");
  if (!main) return;

  main.innerHTML = "";

  for (const item of list) {
    const li = document.createElement("li");
    li.className = "item";
    li.dataset.id = item.id;

    const isExpired = !!(item.expiresAt && item.expiresAt <= Date.now());
    if (isExpired) li.classList.add("expired");

    // ... (other rendering code for item)

    const meta = document.createElement("div");
    meta.className = "meta";
    const hasExpiry = typeof item.expiresAt === "number" && item.expiresAt > 0;
    let expText = hasExpiry ? `expires ${new Date(item.expiresAt).toLocaleString()}` : "no expiry";
    if (isExpired) expText += " • Expired";
    meta.textContent = `${item.domain} • added ${fmtDate(item.addedAt)} • ${expText}`;
    main.appendChild(meta);

    // Append li or other elements as needed
    main.appendChild(li);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", async (e) => {
      const sortMode = e.target.value;
      await chrome.storage.local.set({ sortMode });
      await load();
    });
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.filter = e.target.value;
      load();
    });
  }

  // Hide expired toggle (optional; only if present in DOM)
  const hideToggle = document.getElementById("hideExpiredToggle");
  if (hideToggle) {
    const { hideExpired } = await chrome.storage.local.get(["hideExpired"]);
    hideToggle.checked = hideExpired !== false; // default true
    hideToggle.addEventListener("change", async (e) => {
      await chrome.storage.local.set({ hideExpired: e.target.checked });
      await load();
    });
  }

  await load();
});