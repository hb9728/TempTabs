const MAX_ITEMS = 500; // should match background

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function applyPopupWidth(settings) {
  const w = (settings && settings.popupWidth) || 400;
  document.documentElement.style.setProperty('--popup-width', `${w}px`);
}

function sortList(list, mode, manualOrder) {
  const copy = [...list];
  switch (mode) {
    case "oldest":
      return copy.sort((a, b) => a.addedAt - b.addedAt);
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "domain":
      return copy.sort((a, b) => a.domain.localeCompare(b.domain));
    case "url":
      return copy.sort((a, b) => a.url.localeCompare(b.url));
    case "manual":
      if (!manualOrder?.length) return copy;
      const map = new Map(copy.map(i => [i.id, i]));
      const ordered = manualOrder.map(id => map.get(id)).filter(Boolean);
      const remaining = copy.filter(i => !manualOrder.includes(i.id));
      return [...ordered, ...remaining];
    case "newest":
    default:
      return copy.sort((a, b) => b.addedAt - a.addedAt);
  }
}

const state = { editMode: false, filter: "", renderIds: [] };

function matchesQuery(item, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    (item.title || "").toLowerCase().includes(s) ||
    (item.url || "").toLowerCase().includes(s) ||
    (item.domain || "").toLowerCase().includes(s)
  );
}

function getExpiryPreset(item, settings) {
  // If there's no expiry, it's pinned
  if (typeof item.expiresAt !== "number" || item.expiresAt <= 0) return "never";

  const now = Date.now();
  const remaining = item.expiresAt - now;

  const H = 3600000; // 1 hour
  const PRESETS = [1, 2, 6, 12, 24, 48, 72, 168];
  const TOL = 5 * 60 * 1000; // 5 minutes tolerance

  for (const hrs of PRESETS) {
    if (Math.abs(remaining - hrs * H) <= TOL) return String(hrs);
  }

  // Otherwise treat as default (settings-based) or some custom value
  return "default";
}

function render(list, { editMode = false, settings, sortMode, totalLive }) {
  // ensure width is applied from settings
  applyPopupWidth(settings);

  const ul = document.getElementById("list");
  ul.innerHTML = "";

  state.renderIds = list.map(i => i.id);
  const countEl = document.getElementById("count");
  countEl.textContent = `${list.length}/${totalLive} shown • cap ${MAX_ITEMS}`;

  for (const item of list) {
    const li = document.createElement("li");
    li.className = "item";
    li.dataset.id = item.id;

    const draggable = editMode && sortMode === "manual";
    li.draggable = draggable;
    if (draggable) {
      li.addEventListener("dragstart", (e) => {
        li.classList.add("dragging");
        e.dataTransfer.setData("text/id", item.id);
      });
      li.addEventListener("dragend", () => li.classList.remove("dragging"));
      li.addEventListener("dragover", (e) => {
        e.preventDefault();
        li.classList.add("dragover");
      });
      li.addEventListener("dragleave", () => li.classList.remove("dragover"));
      li.addEventListener("drop", async (e) => {
        e.preventDefault();
        li.classList.remove("dragover");
        const draggedId = e.dataTransfer.getData("text/id");
        const targetId = item.id;
        if (!draggedId || draggedId === targetId) return;
        const rect = li.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        await reorderManual(draggedId, targetId, after);
      });
    }

    const handle = document.createElement("div");
    handle.className = "handle";
    handle.textContent = (editMode && sortMode === "manual") ? "⋮⋮" : "";

    const main = document.createElement("div");
    const a = document.createElement("a");
    a.href = item.url;
    a.textContent = item.title || item.url;
    a.target = "_blank";
    main.appendChild(a);

    const meta = document.createElement("div");
    meta.className = "meta";
    const hasExpiry = typeof item.expiresAt === "number" && item.expiresAt > 0;
    const expText = hasExpiry ? `expires ${new Date(item.expiresAt).toLocaleString()}` : "no expiry";
    meta.textContent = `${item.domain} • added ${fmtDate(item.addedAt)} • ${expText}`;

    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "actions-cell";
    if (editMode) {
      if (sortMode === "manual") {
        const up = document.createElement("button"); up.className = "btn"; up.textContent = "↑";
        const down = document.createElement("button"); down.className = "btn"; down.textContent = "↓";
        actions.appendChild(up); actions.appendChild(down);
        up.addEventListener("click", () => move(item.id, -1));
        down.addEventListener("click", () => move(item.id, +1));
      }

      // Per-item expiry selector (dark themed)
      const sel = document.createElement("select");
      sel.className = "btn-select";
      sel.title = "Expiry for this item";
      sel.innerHTML = `
        <option value="default">⏱ Default</option>
        <option value="1">1 hour</option>
        <option value="2">2 hours</option>
        <option value="6">6 hours</option>
        <option value="12">12 hours</option>
        <option value="24">24 hours</option>
        <option value="48">48 hours</option>
        <option value="72">72 hours</option>
        <option value="168">7 days</option>
        <option value="never">Never</option>
      `;
      // Initial value prefers stored preset if available, otherwise derive from expiresAt
      const initialPreset = (item.expiryPreset && typeof item.expiryPreset === "string")
        ? item.expiryPreset
        : getExpiryPreset(item, settings);
      sel.value = initialPreset;
      sel.addEventListener("change", async (e) => {
        await setItemExpiry(item.id, e.target.value, settings);
        await load();
      });
      actions.appendChild(sel);

      const del = document.createElement("button"); del.className = "btn danger"; del.textContent = "Delete";
      actions.appendChild(del);
      del.addEventListener("click", () => removeItem(item.id));
    }

    li.appendChild(handle);
    li.appendChild(main);
    li.appendChild(actions);
    ul.appendChild(li);
  }
}

async function reorderManual(draggedId, targetId, placeAfter) {
  const { tempTabs, manualOrder } = await chrome.storage.local.get(["tempTabs", "manualOrder"]);
  let order = (manualOrder && manualOrder.length) ? [...manualOrder] : (tempTabs || []).map(i => i.id);
  const rendered = state.renderIds;
  order = order.filter(id => !rendered.includes(id));
  const visible = [...state.renderIds];
  const from = visible.indexOf(draggedId);
  const toBase = visible.indexOf(targetId);
  if (from === -1 || toBase === -1) return;
  visible.splice(from, 1);
  let insertIndex = toBase;
  if (placeAfter && toBase < from) insertIndex = toBase + 1;
  if (placeAfter && toBase >= from) insertIndex = toBase;
  visible.splice(insertIndex, 0, draggedId);
  const nextOrder = [...order, ...visible];
  await chrome.storage.local.set({ manualOrder: nextOrder, sortMode: "manual" });
  await load();
}

async function move(id, dir) {
  const { sortMode, manualOrder, tempTabs } = await chrome.storage.local.get(["sortMode", "manualOrder", "tempTabs"]);
  if (sortMode !== "manual") return;
  let order = (manualOrder && manualOrder.length) ? [...manualOrder] : (tempTabs || []).map(i => i.id);
  const idx = order.indexOf(id);
  if (idx < 0) return;
  const j = idx + dir;
  if (j < 0 || j >= order.length) return;
  [order[idx], order[j]] = [order[j], order[idx]];
  await chrome.storage.local.set({ manualOrder: order });
  await load();
}

async function removeItem(id) {
  const { tempTabs, manualOrder } = await chrome.storage.local.get(["tempTabs", "manualOrder"]);
  const next = (tempTabs || []).filter(i => i.id !== id);
  const nextOrder = (manualOrder || []).filter(x => x !== id);
  await chrome.storage.local.set({ tempTabs: next, manualOrder: nextOrder });
  await load();
}

async function setItemExpiry(id, choice, settings) {
  const { tempTabs } = await chrome.storage.local.get(["tempTabs"]);
  const list = (tempTabs || []).slice();
  const idx = list.findIndex(i => i.id === id);
  if (idx === -1) return;

  const base = typeof list[idx].addedAt === "number" ? list[idx].addedAt : Date.now(); // anchor to creation time
  const defHours = (settings && settings.retentionHours) || 24;

  if (choice === "never") {
    delete list[idx].expiresAt; // pinned: no auto-expiry
  } else if (choice === "default") {
    list[idx].expiresAt = now + defHours * 3600000; // from now using default hours
    list[idx].expiryPreset = "default";
  } else {
    const hrs = Number(choice);
    if (!Number.isNaN(hrs) && hrs > 0) {
      list[idx].expiresAt = now + hrs * 3600000;
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