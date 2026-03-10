(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) return;
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) processPreload(link);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
    }
  }).observe(document, {
    childList: true,
    subtree: true
  });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep) return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const REPO = "sajjadhaider1/rxtracker";
const FILE_PATH = "data.json";
const BRANCH = "data";
const API_URL = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
function getToken() {
  return localStorage.getItem("rxtracker_pat") || "";
}
function setToken(token) {
  localStorage.setItem("rxtracker_pat", token);
}
let appData = null;
let fileSha = null;
let saving = false;
async function fetchData() {
  const res = await fetch(`${API_URL}?ref=${BRANCH}`, {
    headers: {
      Authorization: `token ${getToken()}`,
      Accept: "application/vnd.github.v3+json"
    }
  });
  if (!res.ok) {
    const err = new Error(`GitHub GET failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  fileSha = json.sha;
  const decoded = decodeURIComponent(escape(atob(json.content)));
  return JSON.parse(decoded);
}
async function saveData(data) {
  const today = getToday();
  data.date_updated = today;
  const content = btoa(
    unescape(encodeURIComponent(JSON.stringify(data, null, 2) + "\n"))
  );
  const res = await fetch(API_URL, {
    method: "PUT",
    headers: {
      Authorization: `token ${getToken()}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Update inventory ${today}`,
      content,
      sha: fileSha,
      branch: BRANCH
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`GitHub PUT failed: ${res.status} — ${err.message}`);
  }
  const json = await res.json();
  fileSha = json.content.sha;
}
async function persist(successMsg) {
  if (saving) {
    showToast("Save in progress…");
    return;
  }
  saving = true;
  appData.date_updated = getToday();
  render();
  try {
    await saveData(appData);
    showToast(successMsg);
  } catch (e) {
    showToast("Save failed — " + e.message);
    console.error(e);
  } finally {
    saving = false;
  }
}
function getToday() {
  const d = /* @__PURE__ */ new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function daysBetween(dateStr1, dateStr2) {
  const d1 = /* @__PURE__ */ new Date(dateStr1 + "T00:00:00");
  const d2 = /* @__PURE__ */ new Date(dateStr2 + "T00:00:00");
  return Math.round((d2 - d1) / (1e3 * 60 * 60 * 24));
}
function applyDayElapsed(data) {
  const today = getToday();
  const daysPassed = daysBetween(data.date_updated, today);
  if (daysPassed <= 0) return false;
  for (const med of data.medicines) {
    med.in_stock = Math.max(0, med.in_stock - med.daily_units * daysPassed);
    recalcOrder(med, data.days_to_stock);
  }
  data.date_updated = today;
  return true;
}
function nextId(medicines) {
  if (medicines.length === 0) return "MED-001";
  const nums = medicines.map((m) => parseInt(m.id.replace("MED-", ""), 10));
  const next = Math.max(...nums) + 1;
  return `MED-${String(next).padStart(3, "0")}`;
}
function recalcOrder(med, daysToStock) {
  med.units_to_order = Math.max(
    0,
    med.daily_units * daysToStock - med.in_stock
  );
}
const $ = (sel) => document.querySelector(sel);
const dateDisplay = $("#date-display");
const daysToStockDisplay = $("#days-to-stock-display");
const tableBody = $("#medicine-table-body");
const emptyState = $("#empty-state");
const modalBackdrop = $("#modal-backdrop");
const modalTitle = $("#modal-title");
const formId = $("#form-id");
const formName = $("#form-name");
const formDaily = $("#form-daily");
const formStock = $("#form-stock");
const medicineForm = $("#medicine-form");
const toast = $("#toast");
const loadingOverlay = $("#loading-overlay");
const appEl = $("#app");
function show(el, display) {
  el.classList.remove("hidden");
  if (display) el.classList.add(display);
}
function hide(el, display) {
  el.classList.add("hidden");
  if (display) el.classList.remove(display);
}
function render() {
  dateDisplay.textContent = appData.date_updated;
  daysToStockDisplay.textContent = appData.days_to_stock;
  const meds = appData.medicines;
  if (meds.length === 0) {
    tableBody.innerHTML = "";
    show(emptyState);
    return;
  }
  hide(emptyState);
  tableBody.innerHTML = meds.map((med) => {
    return `
      <tr class="border-t border-stone-100 active:bg-stone-50 group" data-id="${med.id}">
        <td class="px-3 sm:px-5 py-2.5 sm:py-3.5">
          <span class="font-medium text-stone-800 text-sm">${escapeHtml(med.medicine_name)}</span>
        </td>
        <td class="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right font-mono text-sm text-stone-600 hidden sm:table-cell">${med.daily_units}</td>
        <td class="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right font-mono text-sm text-stone-600">${med.in_stock}</td>
        <td class="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right font-mono text-sm font-medium ${med.units_to_order > 0 ? "text-red-600" : "text-emerald-600"}">${med.units_to_order}</td>
        <td class="px-2 sm:px-5 py-2.5 sm:py-3.5 text-right">
          <div class="flex items-center justify-end gap-0.5">
            <span class="restock-inline hidden items-center gap-0.5">
              <input type="number" min="0" step="any" inputmode="decimal" class="restock-input w-14 px-1.5 py-1 border border-stone-200 rounded text-xs font-mono text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="qty" />
              <button class="btn-restock-confirm p-1.5 rounded active:bg-emerald-100 text-emerald-600 cursor-pointer" title="Confirm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              </button>
            </span>
            <button class="btn-restock p-1.5 rounded active:bg-emerald-50 text-stone-400 active:text-emerald-600 transition-colors cursor-pointer" title="Add stock">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            </button>
            <button class="btn-edit p-1.5 rounded active:bg-stone-100 text-stone-400 active:text-teal-700 transition-colors cursor-pointer" title="Edit">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button class="btn-delete p-1.5 rounded active:bg-red-50 text-stone-400 active:text-red-600 transition-colors cursor-pointer" title="Delete">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.remove("translate-y-20", "opacity-0");
  toastTimer = setTimeout(() => {
    toast.classList.add("translate-y-20", "opacity-0");
  }, 2500);
}
function openModal(med = null) {
  if (med) {
    modalTitle.textContent = "Edit Medicine";
    formId.value = med.id;
    formName.value = med.medicine_name;
    formDaily.value = med.daily_units;
    formStock.value = med.in_stock;
  } else {
    modalTitle.textContent = "Add Medicine";
    medicineForm.reset();
    formId.value = "";
  }
  show(modalBackdrop, "flex");
  formName.focus();
}
function closeModal() {
  hide(modalBackdrop, "flex");
}
async function handleSave() {
  if (!medicineForm.reportValidity()) return;
  const name = formName.value.trim();
  const daily = parseFloat(formDaily.value);
  const stock = parseFloat(formStock.value);
  const editId = formId.value;
  if (editId) {
    const med = appData.medicines.find((m) => m.id === editId);
    if (!med) return;
    med.medicine_name = name;
    med.daily_units = daily;
    med.in_stock = stock;
    recalcOrder(med, appData.days_to_stock);
  } else {
    const newMed = {
      id: nextId(appData.medicines),
      medicine_name: name,
      daily_units: daily,
      in_stock: stock,
      units_to_order: 0
    };
    recalcOrder(newMed, appData.days_to_stock);
    appData.medicines.push(newMed);
  }
  closeModal();
  await persist(editId ? "Medicine updated" : "Medicine added");
}
function openRestockInput(row) {
  tableBody.querySelectorAll(".restock-inline").forEach((el) => {
    hide(el, "inline-flex");
  });
  const inline = row.querySelector(".restock-inline");
  const input = row.querySelector(".restock-input");
  show(inline, "inline-flex");
  input.value = "";
  input.focus();
}
async function submitRestock(row) {
  const id = row.dataset.id;
  const med = appData.medicines.find((m) => m.id === id);
  if (!med) return;
  const input = row.querySelector(".restock-input");
  const units = parseFloat(input.value);
  if (isNaN(units) || units <= 0) {
    showToast("Enter a valid positive number");
    input.focus();
    return;
  }
  med.in_stock += units;
  recalcOrder(med, appData.days_to_stock);
  await persist(`Added ${units} units to ${med.medicine_name}`);
}
async function handleDelete(id) {
  const med = appData.medicines.find((m) => m.id === id);
  if (!med) return;
  if (!confirm(`Delete "${med.medicine_name}"?`)) return;
  appData.medicines = appData.medicines.filter((m) => m.id !== id);
  await persist("Medicine deleted");
}
const dtsShow = $("#days-to-stock-show");
const dtsEdit = $("#days-to-stock-edit");
const dtsInput = $("#days-to-stock-input");
dtsShow.addEventListener("click", () => {
  hide(dtsShow);
  show(dtsEdit, "inline-flex");
  dtsInput.value = appData.days_to_stock;
  dtsInput.focus();
  dtsInput.select();
});
function closeDtsEdit() {
  hide(dtsEdit, "inline-flex");
  show(dtsShow);
}
async function submitDtsEdit() {
  const val = parseInt(dtsInput.value, 10);
  if (isNaN(val) || val < 1) {
    showToast("Enter a valid number of days");
    dtsInput.focus();
    return;
  }
  appData.days_to_stock = val;
  for (const med of appData.medicines) {
    recalcOrder(med, val);
  }
  closeDtsEdit();
  await persist(`Stock window set to ${val} days`);
}
$("#days-to-stock-confirm").addEventListener("click", submitDtsEdit);
dtsInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitDtsEdit();
  }
  if (e.key === "Escape") closeDtsEdit();
});
$("#btn-add").addEventListener("click", () => openModal());
$("#btn-cancel").addEventListener("click", closeModal);
$("#btn-save").addEventListener("click", handleSave);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.key === "Enter" && !modalBackdrop.classList.contains("hidden")) {
    e.preventDefault();
    handleSave();
  }
});
tableBody.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("restock-input")) {
    e.preventDefault();
    e.stopPropagation();
    const row = e.target.closest("tr");
    if (row) submitRestock(row);
  }
  if (e.key === "Escape" && e.target.classList.contains("restock-input")) {
    const inline = e.target.closest(".restock-inline");
    hide(inline, "inline-flex");
  }
});
tableBody.addEventListener("click", (e) => {
  const row = e.target.closest("tr");
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest(".btn-restock")) {
    openRestockInput(row);
    return;
  }
  if (e.target.closest(".btn-restock-confirm")) {
    submitRestock(row);
    return;
  }
  if (e.target.closest(".btn-edit")) {
    const med = appData.medicines.find((m) => m.id === id);
    if (med) openModal(med);
  }
  if (e.target.closest(".btn-delete")) {
    handleDelete(id);
  }
});
const tokenScreen = $("#token-screen");
const tokenInput = $("#token-input");
const tokenError = $("#token-error");
async function startApp() {
  loadingOverlay.classList.remove("hidden", "opacity-0");
  try {
    appData = await fetchData();
    const updated = applyDayElapsed(appData);
    if (updated) {
      await saveData(appData);
      showToast("Stock levels updated for elapsed days");
    }
    render();
  } catch (e) {
    console.error("Init failed:", e);
    if (e.status === 401 || e.status === 403) {
      localStorage.removeItem("rxtracker_pat");
      hide(loadingOverlay);
      show(tokenScreen);
      show(tokenError);
      tokenError.textContent = "Token expired or invalid. Enter a new one.";
      return;
    }
    showToast("Failed to load data — check console");
  } finally {
    loadingOverlay.classList.add("opacity-0");
    setTimeout(() => hide(loadingOverlay), 300);
    appEl.classList.remove("opacity-0");
  }
}
$("#token-submit").addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) return;
  hide(tokenError);
  setToken(token);
  hide(tokenScreen);
  await startApp();
});
tokenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#token-submit").click();
});
if (getToken()) {
  startApp();
} else {
  show(tokenScreen);
}
