# TempTabs

**TempTabs** is a lightweight browser extension for saving tabs with an expiry time.  
Perfect for keeping track of links you only need temporarily — like research, shopping, or reminders — without cluttering your bookmarks.

---

## ✨ Features

- **Save current tab** with one click.
- **Expiry times** – tabs automatically expire after a set duration.
- **Override expiry** – extend or shorten expiry relative to the original added time.
- **Expired handling**  
  - Tabs gray out with an **Expired** tag.  
  - Toggle to **show/hide expired items**.
- **Sorting options** – newest, oldest, title, domain, URL, or manual order (drag & drop).
- **Quick search** – filter by title, domain, or URL.
- **One-click actions** – open, copy, delete, or change expiry per item.
- **Batch actions** – clear expired or clear all.

---

## 📸 Screenshots

*(Add screenshots here once you have them!)*

---

## 🛠️ Installation

### From Source (Developer Mode)
1. Clone or download this repository.
2. Open your browser’s extensions page:
   - **Chrome/Edge**: `chrome://extensions`
   - **Firefox**: `about:debugging#/runtime/this-firefox`
3. Enable **Developer Mode**.
4. Click **Load unpacked** (or **Load Temporary Add-on** in Firefox) and select the repo folder.
5. The extension should now appear in your toolbar as **TempTabs**.

*(Publishing to Chrome Web Store / AMO coming soon.)*

---

## ⚙️ Usage

- Click the **＋** button to add the current tab.
- Use the **expiry dropdown** on each saved item to adjust how long it lasts.
- **Expired items** are tagged and grayed out.
  - Toggle **“Show expired”** in the footer to display or hide them.
- Use the **Clear expired** or **Clear all** buttons for housekeeping.

---

## 🚀 Development

- **popup.html / popup.css / popup.js** – main UI and logic
- **background.js** – manages data persistence
- **manifest.json** – extension configuration

To make changes:
```bash
git clone https://github.com/yourusername/temptabs.git
cd temptabs
# edit files, then reload the extension in your browser
```
tests