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
    const exp = item.expiresAt ? `expires ${new Date(item.expiresAt).toLocaleString()}` : "";
    meta.textContent = `${item.domain} • added ${fmtDate(item.addedAt)}${exp ? " • " + exp : ""}`;

    if (editMode) {
      const select = document.createElement("select");
      const options = [
        { label: "Default", value: "default" },
        { label: "1 hour", value: "1h" },
        { label: "1 day", value: "1d" },
        { label: "1 week", value: "1w" },
        { label: "Never", value: "never" }
      ];
      for (const opt of options) {
        const optionEl = document.createElement("option");
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        select.appendChild(optionEl);
      }

      // Determine select value based on item.expiresAt
      if (item.expiresAt == null) {
        select.value = "never";
      } else {
        const now = Date.now();
        const diff = item.expiresAt - now;
        if (diff <= 0) {
          select.value = "default";
        } else if (diff <= 3600000) { // 1 hour
          select.value = "1h";
        } else if (diff <= 86400000) { // 1 day
          select.value = "1d";
        } else if (diff <= 604800000) { // 1 week
          select.value = "1w";
        } else {
          select.value = "default";
        }
      }

      select.addEventListener("change", async (e) => {
        let newExpiresAt = null;
        const val = e.target.value;
        const now = Date.now();
        switch(val) {
          case "default":
            newExpiresAt = null;
            break;
          case "1h":
            newExpiresAt = now + 3600000;
            break;
          case "1d":
            newExpiresAt = now + 86400000;
            break;
          case "1w":
            newExpiresAt = now + 604800000;
            break;
          case "never":
            newExpiresAt = null;
            break;
        }
        await updateExpiry(item.id, newExpiresAt);
      });

      meta.appendChild(select);
    }

    main.appendChild(meta);

    const actions = document.createElement("div");
    if (editMode) {
      if (sortMode === "manual") {
        const up = document.createElement("button"); up.className = "btn"; up.textContent = "↑";
        const down = document.createElement("button"); down.className = "btn"; down.textContent = "↓";
        actions.appendChild(up); actions.appendChild(down);
        up.addEventListener("click", () => move(item.id, -1));
        down.addEventListener("click", () => move(item.id, +1));
      }
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

async function clearExpired() {
  await chrome.runtime.sendMessage({ type: "tt:cleanup" });
  await load();
}

async function clearAll() {
  if (!confirm("Clear all saved items?")) return;
  await chrome.storage.local.set({ tempTabs: [], manualOrder: [] });
  await load();
}

async function updateExpiry(id, expiresAt) {
  const { tempTabs } = await chrome.storage.local.get(["tempTabs"]);
  if (!tempTabs) return;
  const nextTabs = tempTabs.map(tab => {
    if (tab.id === id) {
      return { ...tab, expiresAt };
    }
    return tab;
  });
  await chrome.storage.local.set({ tempTabs: nextTabs });
  await load();
}

async function load() {
  const { tempTabs, settings, sortMode, manualOrder } = await chrome.storage.local.get(["tempTabs", "settings", "sortMode", "manualOrder"]);
  const now = Date.now();
  const live = (tempTabs || []).filter(i => !i.expiresAt || i.expiresAt > now);
  const totalLive = live.length;
  const filtered = state.filter ? live.filter(i => matchesQuery(i, state.filter)) : live;
  const sorted = sortList(filtered, sortMode || "newest", manualOrder || []);
  render(sorted, { editMode: state.editMode, settings, sortMode: sortMode || "newest", totalLive });
  document.getElementById("sortSelect").value = sortMode || "newest";
  document.getElementById("searchInput").value = state.filter;
}

document.addEventListener("DOMContentLoaded", async () => {
  await load();
  document.getElementById("addBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "tt:addCurrentTab" });
    await load();
  });
  document.getElementById("editToggle").addEventListener("click", async () => {
    state.editMode = !state.editMode;
    await load();
  });
  document.getElementById("refreshBtn").addEventListener("click", load);
  document.getElementById("clearExpired").addEventListener("click", clearExpired);
  document.getElementById("clearAll").addEventListener("click", clearAll);
  document.getElementById("sortSelect").addEventListener("change", async (e) => {
    await chrome.storage.local.set({ sortMode: e.target.value });
    await load();
  });
  document.getElementById("settingsLink").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  document.getElementById("searchInput").addEventListener("input", async (e) => {
    state.filter = e.target.value.trim();
    await load();
  });
});