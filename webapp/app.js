const tg = window.Telegram?.WebApp;
const params = new URLSearchParams(window.location.search);

// Debug режим только для разработки (проверка через параметр URL)
const isDevelopment = params.get("dev") === "true";

const APP_VERSION = "2025-12-12-uiux-debug-1";

function agentLog(payload) {
  try {
    const entry = {
      ...payload,
      timestamp: payload.timestamp || Date.now(),
      sessionId: payload.sessionId || "debug-session",
    };
    // in-memory buffer (works even if network blocked)
    const buf = (window.__agentLogs = window.__agentLogs || []);
    buf.push(entry);
    if (buf.length > 200) buf.splice(0, buf.length - 200);

    // persist for post-crash retrieval (dev only)
    if (isDevelopment) {
      try {
        const serialized = JSON.stringify(buf.slice(-200));
        localStorage.setItem("__agentLogs", serialized);
      } catch {}
    }

    // best-effort network ingest (may be blocked in TG WebView)
    fetch("http://127.0.0.1:7242/ingest/039189cd-7fb5-4777-b167-f32680af685e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).catch(() => {});
  } catch {}
}

function mountDevDebugPanel() {
  if (!isDevelopment) return;
  if (document.getElementById("agent-debug-panel")) return;
  const panel = document.createElement("div");
  panel.id = "agent-debug-panel";
  panel.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:99999;max-width:calc(100vw - 24px);background:rgba(0,0,0,.75);color:#fff;border-radius:12px;padding:10px 12px;font:12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;backdrop-filter:blur(8px)";
  panel.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
      <div><strong>Debug</strong> <span style="opacity:.85">${APP_VERSION}</span></div>
      <div style="display:flex;gap:6px">
        <button type="button" id="agent-debug-copy" style="appearance:none;border:0;border-radius:10px;padding:6px 10px;background:#4c6fff;color:#fff;font-weight:600;cursor:pointer">Copy logs</button>
        <button type="button" id="agent-debug-hide" style="appearance:none;border:0;border-radius:10px;padding:6px 10px;background:rgba(255,255,255,.14);color:#fff;cursor:pointer">Hide</button>
      </div>
    </div>
    <div id="agent-debug-status" style="margin-top:6px;opacity:.9;word-break:break-word"></div>
  `;
  document.body.appendChild(panel);

  const status = panel.querySelector("#agent-debug-status");
  const refresh = () => {
    const buf = window.__agentLogs || [];
    const last = buf[buf.length - 1];
    status.textContent = last ? `${last.location} — ${last.message}` : "логов пока нет";
  };
  refresh();
  setInterval(refresh, 400);

  panel.querySelector("#agent-debug-hide").addEventListener("click", () => panel.remove());
  panel.querySelector("#agent-debug-copy").addEventListener("click", async () => {
    try {
      const buf = window.__agentLogs || JSON.parse(localStorage.getItem("__agentLogs") || "[]");
      const text = buf.map((x) => JSON.stringify(x)).join("\n");
      await navigator.clipboard.writeText(text);
      status.textContent = `скопировано строк: ${buf.length}`;
    } catch (e) {
      status.textContent = `не удалось скопировать: ${String(e?.message || e)}`;
    }
  });
}

try {
  document.documentElement.dataset.appVersion = APP_VERSION;
  if (isDevelopment) {
    // ensure panel mounts even if init() fails early
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountDevDebugPanel, { once: true });
    } else {
      mountDevDebugPanel();
    }
  }
} catch {}

// #region agent log
agentLog({
  location: "webapp/app.js:module",
  message: "module_loaded",
  data: {
    appVersion: APP_VERSION,
    href: window.location.href,
    hasTg: !!window.Telegram?.WebApp,
    hasInitData: !!window.Telegram?.WebApp?.initData,
    hasFamilySelect: !!document.getElementById("family-select"),
    hasScopeChips: !!document.getElementById("scope-chips"),
  },
  runId: "pre-fix",
  hypothesisId: "A",
});
// #endregion

// #region agent log
window.addEventListener("error", (e) => {
  agentLog({
    location: "webapp/app.js:window.error",
    message: "window_error",
    data: {
      message: e?.message,
      filename: e?.filename,
      lineno: e?.lineno,
      colno: e?.colno,
      stack: String(e?.error?.stack || "").slice(0, 1200),
    },
    runId: "pre-fix",
    hypothesisId: "B",
  });
});
// #endregion

// #region agent log
window.addEventListener("unhandledrejection", (e) => {
  agentLog({
    location: "webapp/app.js:window.unhandledrejection",
    message: "unhandled_rejection",
    data: { reason: String(e?.reason?.message || e?.reason || "").slice(0, 1200) },
    runId: "pre-fix",
    hypothesisId: "C",
  });
});
// #endregion

const state = {
  token: null,
  debugUserId: isDevelopment ? params.get("debug_user") : null,
  families: [],
  scope: { type: "personal", familyId: null },
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: new Date(),
  tasks: [],
  taskMap: {},
  viewMode: "calendar", // "calendar" | "kanban"
  kanbanDaysCount: 7, // Количество дней для отображения в канбане (7, 14, 30 или 0 для всего месяца)
};

const ui = {
  monthYearLabel: document.getElementById("month-year-label"),
  calendarGrid: document.getElementById("calendar-grid"),
  calendarView: document.getElementById("calendar-view"),
  kanbanView: document.getElementById("kanban-view"),
  kanbanBoard: document.getElementById("kanban-board"),
  kanbanDaysSelect: document.getElementById("kanban-days-select"),
  taskList: document.getElementById("task-list"),
  scopeChips: document.getElementById("scope-chips"),
  btnBack: document.getElementById("btn-back"),
  btnForward: document.getElementById("btn-forward"),
  btnViewCalendar: document.getElementById("btn-view-calendar"),
  btnViewKanban: document.getElementById("btn-view-kanban"),
  taskForm: document.getElementById("task-form"),
  taskFormSheet: document.getElementById("task-form-sheet"),
  taskFormOverlay: document.getElementById("task-form-overlay"),
  taskTemplate: document.getElementById("task-item-template"),
  familyModal: document.getElementById("family-modal"),
  inputFamilyName: document.getElementById("new-family-name"),
  btnSaveFamily: document.getElementById("btn-save-family"),
  btnCancelFamily: document.getElementById("btn-cancel-family"),
  membersModal: document.getElementById("members-modal"),
  membersModalTitle: document.getElementById("members-modal-title"),
  membersList: document.getElementById("members-list"),
  membersSearchInput: document.getElementById("members-search-input"),
  btnCloseMembers: document.getElementById("btn-close-members"),
  fabAddTask: document.getElementById("fab-add-task"),
  familySelect: document.getElementById("family-select"),
  taskDateInput: document.getElementById("task-date-input"),
};

function formatISO(date) {
  // Локальная дата без UTC-сдвига, чтобы не было смещения на -1 день
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISO(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function monthBounds(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

function russianMonth(date) {
  const month = date.toLocaleDateString("ru-RU", { month: "long" });
  const year = date.getFullYear();
  return `${month} ${year} г.`;
}

function formatDateHuman(date) {
  return date.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

function formatTimeRange(task) {
  const start = task.start_time ? task.start_time.slice(0, 5) : null;
  const end = task.end_time ? task.end_time.slice(0, 5) : null;
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  if (end) return end;
  return null;
}

async function authenticate() {
  if (tg?.initData) {
    const res = await fetch("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: tg.initData }),
    });
    if (!res.ok) throw new Error("Auth failed");
    const data = await res.json();
    state.token = data.token;
    tg.ready();
  } else if (!state.debugUserId) {
    throw new Error("Нет Telegram init data. Добавь ?debug_user=1 для теста");
  }
}

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  } else if (state.debugUserId) {
    headers["X-Debug-User-Id"] = state.debugUserId;
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "API error");
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadFamilies() {
  const families = await apiFetch("/families");
  state.families = families;
  populateFamilySelect();
  renderScopeChips();
}

function populateFamilySelect() {
  if (ui.familySelect) {
    ui.familySelect.innerHTML = '<option value="">Не выбрана</option>';
    state.families.forEach((family) => {
      const option = document.createElement("option");
      option.value = family.id;
      option.textContent = family.name;
      ui.familySelect.appendChild(option);
    });
    ui.familySelect.disabled = !state.families.length;
  }
}

function renderScopeChips() {
  ui.scopeChips.innerHTML = "";
  const scopes = [
    { label: "Личное", type: "personal", familyId: null },
    ...state.families.map((family) => ({
      label: family.name,
      type: "family",
      familyId: family.id,
    })),
  ];

  scopes.forEach((scope) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "scope-chip" + (isScopeActive(scope) ? " active" : "");
    chip.textContent = scope.label;
    chip.dataset.type = scope.type;
    chip.dataset.familyId = scope.familyId ?? "";
    chip.addEventListener("click", () => {
      state.scope = scope;
      fetchTasks();
      renderScopeChips();
      syncFormScope(); // Важно обновить форму при переключении чипса
    });
    if (isScopeActive(scope) && scope.type === 'family') {
      const family = state.families.find((f) => f.id === scope.familyId);
      if (family) {
        // Проверяем, является ли пользователь владельцем (нужно будет добавить проверку)
        const membersBtn = document.createElement("button");
        membersBtn.className = "members-btn";
        membersBtn.innerHTML = "👥";
        membersBtn.title = "Участники группы";
        membersBtn.onclick = (e) => {
          e.stopPropagation();
          openMembersModal(scope.familyId, scope.label);
        };
        chip.appendChild(membersBtn);

        const shareBtn = document.createElement("button");
        shareBtn.className = "share-btn";
        shareBtn.innerHTML = "🔗";
        shareBtn.title = "Пригласить участника";
        shareBtn.onclick = (e) => {
          e.stopPropagation();
          shareFamilyInvite(scope.familyId, scope.label, family.invite_code);
        };
        chip.appendChild(shareBtn);

        const leaveBtn = document.createElement("button");
        leaveBtn.className = "leave-btn";
        leaveBtn.innerHTML = "✕"; 
        leaveBtn.title = "Покинуть группу";
        leaveBtn.onclick = (e) => {
          e.stopPropagation();
          leaveFamily(scope.familyId, family.name);
        };
        chip.appendChild(leaveBtn);
      }
    }
    ui.scopeChips.appendChild(chip);
    
  });

  // --- НОВАЯ ЧАСТЬ: Кнопка добавления семьи (+) ---
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "scope-chip btn-add-scope";
  addBtn.textContent = "+";
  addBtn.addEventListener("click", openFamilyModal);
  ui.scopeChips.appendChild(addBtn);
}

function isScopeActive(scope) {
  return (
    state.scope.type === scope.type &&
    (scope.type === "personal" || Number(state.scope.familyId) === Number(scope.familyId))
  );
}

function buildCalendar() {
  const { start } = monthBounds(state.currentMonth);
  const firstWeekDay = (start.getDay() || 7) - 1; // Monday first
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - firstWeekDay);

  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    days.push(date);
  }
  return days;
}

function renderCalendar() {
  const days = buildCalendar();
  ui.calendarGrid.innerHTML = "";
  if (ui.monthYearLabel) {
    ui.monthYearLabel.textContent = russianMonth(state.currentMonth);
  }

  days.forEach((day) => {
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    if (day.getMonth() !== state.currentMonth.getMonth()) {
      cell.classList.add("outside");
    }
    if (formatISO(day) === formatISO(state.selectedDate)) {
      cell.classList.add("selected");
    }

    // Номер дня в правом верхнем углу
    const dayNumber = document.createElement("div");
    dayNumber.className = "calendar-day__number";
    dayNumber.textContent = day.getDate();
    cell.appendChild(dayNumber);

    // Цветные точки для задач
    const key = formatISO(day);
    const tasksForDay = state.taskMap[key] || [];
    if (tasksForDay.length) {
      const dotsContainer = document.createElement("div");
      dotsContainer.className = "calendar-day__dots";
      
      // Группируем задачи по цветам и показываем до 3 точек
      const colors = [...new Set(tasksForDay.slice(0, 3).map(t => t.color || "#4c6fff"))];
      colors.forEach(color => {
        const dot = document.createElement("span");
        dot.className = "calendar-day__dot";
        dot.style.background = color;
        dotsContainer.appendChild(dot);
      });
      
      cell.appendChild(dotsContainer);
      
      // Tooltip с количеством задач
      if (tasksForDay.length > 0) {
        cell.title = `${tasksForDay.length} ${tasksForDay.length === 1 ? 'задача' : tasksForDay.length < 5 ? 'задачи' : 'задач'}`;
      }
    }

    cell.addEventListener("click", () => {
      state.selectedDate = day;
      renderCalendar();
      renderTaskList();
      syncFormDate();
      // Прокручиваем к списку задач выбранного дня
      const selectedDayTasks = document.getElementById("selected-day-tasks");
      if (selectedDayTasks) {
        setTimeout(() => {
          selectedDayTasks.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      }
    });
    ui.calendarGrid.appendChild(cell);
  });
}

function renderTaskList() {
  const key = formatISO(state.selectedDate);
  const tasks = state.taskMap[key] || [];
  ui.taskList.innerHTML = "";
  
  if (!tasks.length) {
    const empty = document.createElement("li");
    empty.textContent = "Пока нет задач";
    empty.className = "task-card";
    empty.style.padding = "20px";
    empty.style.textAlign = "center";
    empty.style.color = "var(--text-hint)";
    ui.taskList.appendChild(empty);
    return;
  }

  tasks.forEach((task) => {
    const node = ui.taskTemplate.content.cloneNode(true);
    const taskCard = node.querySelector(".task-card");
    
    // Применяем цвет к полоске
    const colorBar = node.querySelector(".task-card__color-bar");
    if (task.color) {
      colorBar.style.background = task.color;
    } else {
      colorBar.style.background = "var(--primary)";
    }
    
    // Заголовок задачи
    const titleEl = node.querySelector(".task-card__title");
    titleEl.textContent = task.title;
    if (task.title.length > 50) {
      taskCard.title = task.title;
    }
    
    // Мета-информация (время и группа)
    const metaEl = node.querySelector(".task-card__meta");
    const meta = [];
    const time = formatTimeRange(task);
    if (time) meta.push(time);
    if (task.scope === "family" && task.family_id) {
      const family = state.families.find((f) => f.id === task.family_id);
      if (family) {
        const familyChip = document.createElement("span");
        familyChip.className = "task-tag";
        familyChip.textContent = family.name;
        metaEl.appendChild(familyChip);
      }
    }
    if (time) {
      const timeSpan = document.createElement("span");
      timeSpan.textContent = time;
      metaEl.appendChild(timeSpan);
    }
    
    // Теги
    const tagsContainer = node.querySelector(".task-card__tags");
    if (task.tags && task.tags.length > 0) {
      task.tags.forEach(tag => {
        const tagEl = document.createElement("span");
        tagEl.className = "task-tag";
        tagEl.textContent = tag;
        tagsContainer.appendChild(tagEl);
      });
    } else {
      tagsContainer.remove();
    }
    
    const deleteBtn = node.querySelector(".task-card__delete");
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      confirmDelete(task.id);
    });
    ui.taskList.appendChild(node);
  });
}

function syncFormDate() {
  if (ui.taskDateInput) {
    ui.taskDateInput.value = formatISO(state.selectedDate);
  }
}

function syncFormScope() {
  // #region agent log
  agentLog({
    location: "webapp/app.js:syncFormScope:entry",
    message: "syncFormScope_entry",
    data: {
      appVersion: APP_VERSION,
      hasFamilySelect: !!ui.familySelect,
      familiesCount: Array.isArray(state.families) ? state.families.length : null,
      scopeType: state.scope?.type,
      scopeFamilyId: state.scope?.familyId,
      willSetFamily: !!(ui.familySelect && state.scope?.type === "family" && state.scope?.familyId),
    },
    runId: "pre-fix",
    hypothesisId: "B",
  });
  // #endregion

  if (ui.familySelect) {
    if (state.scope.type === "family" && state.scope.familyId) {
      ui.familySelect.value = state.scope.familyId;
      ui.familySelect.disabled = false;
    } else {
      ui.familySelect.value = "";
      ui.familySelect.disabled = state.families.length === 0;
    }
  }

  // #region agent log
  agentLog({
    location: "webapp/app.js:syncFormScope:exit",
    message: "syncFormScope_exit",
    data: {
      hasFamilySelect: !!ui.familySelect,
      familySelectValue: ui.familySelect?.value,
      familySelectDisabled: ui.familySelect?.disabled,
    },
    runId: "pre-fix",
    hypothesisId: "B",
  });
  // #endregion
}

async function fetchTasks() {
  const { start, end } = monthBounds(state.currentMonth);
  const params = new URLSearchParams({
    start: formatISO(start),
    end: formatISO(end),
    scope: state.scope.type,
  });
  if (state.scope.type === "family" && state.scope.familyId) {
    params.append("family_id", state.scope.familyId);
  }
  const tasks = await apiFetch(`/tasks?${params.toString()}`);
  state.tasks = tasks;
  state.taskMap = tasks.reduce((acc, task) => {
    const key = task.date;
    acc[key] = acc[key] || [];
    acc[key].push(task);
    return acc;
  }, {});
  renderCurrentView();
  renderTaskList();
}

function openFamilyModal() {
  ui.inputFamilyName.value = ""; // Очищаем поле
  ui.familyModal.classList.remove("hidden");
  ui.inputFamilyName.focus();
}

function closeFamilyModal() {
  ui.familyModal.classList.add("hidden");
}

async function createFamily() {
  const name = ui.inputFamilyName.value.trim();
  if (!name) return;

  try {
    // Отправляем запрос на сервер
    // Предполагается, что бэкенд ожидает JSON { "name": "..." }
    await apiFetch("/families", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    // Обновляем список групп и закрываем окно
    await loadFamilies();
    closeFamilyModal();
  } catch (error) {
    alert("Ошибка создания семьи: " + error.message);
  }
}

function shareFamilyInvite(familyId, familyName, inviteCode) {
  // ЗАМЕНИТЕ НА ВАШИ ДАННЫЕ ИЗ BOTFATHER
  const botUsername = "calendarbottestbot"; 
  const appName = "calendar"; // Short name вашего web app
  
  // Формируем startapp параметр
  const startParam = `invite_${inviteCode}`;
  
  // Полная ссылка на приложение
  const inviteLink = `https://t.me/${botUsername}/${appName}?startapp=${startParam}`;
  
  // Текст сообщения
  const text = `Присоединяйся к моему календарю "${familyName}"!`;
  
  // Используем нативный метод Telegram для шэринга
  const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
  tg.openTelegramLink(url);
}

async function checkInvite() {
  if (!tg?.initDataUnsafe) return;
  // Получаем start_param из Telegram
  const startParam = tg.initDataUnsafe?.start_param;
  
  // Проверяем, есть ли параметр и начинается ли он с invite_
  if (startParam && startParam.startsWith("invite_")) {
    const inviteCode = startParam.split("_")[1];
    
    if (inviteCode) {
      const confirmJoin = confirm(`Вступить по приглашению (код ${inviteCode})?`);
      if (!confirmJoin) return;

      try {
        await apiFetch(`/families/join`, { method: "POST", body: JSON.stringify({ invite_code: inviteCode }) });
        alert("Вы успешно вступили в группу!");
        // Перезагружаем список групп, чтобы новая группа появилась в списке
        await loadFamilies();
      } catch (error) {
        console.error(error);
        alert("Не удалось вступить в группу: " + error.message);
      }
    }
  }
}

async function leaveFamily(familyId, familyName) {
  if (!confirm(`Вы действительно хотите покинуть группу "${familyName}"?`)) return;
  try {
    await apiFetch(`/families/${familyId}/leave`, { method: "DELETE" });
    alert(`Вы покинули группу "${familyName}"`);
    
    // Если мы были в этой группе, переключаемся на личное
    if (state.scope.type === "family" && Number(state.scope.familyId) === Number(familyId)) {
        state.scope = { type: "personal", familyId: null };
        syncFormScope();
    }
    
    await loadFamilies();
    await fetchTasks(); // Перезагружаем задачи, т.к. групповые больше недоступны
  } catch (error) {
    alert("Не удалось покинуть группу: " + error.message);
  }
}

let currentFamilyMembers = [];
let currentFamilyId = null;

async function openMembersModal(familyId, familyName) {
  currentFamilyId = familyId;
  ui.membersModalTitle.textContent = `Участники группы "${familyName}"`;
  ui.membersModal.classList.remove("hidden");
  ui.membersSearchInput.value = "";
  await loadFamilyMembers(familyId);
}

function closeMembersModal() {
  ui.membersModal.classList.add("hidden");
  currentFamilyMembers = [];
  currentFamilyId = null;
}

async function loadFamilyMembers(familyId) {
  try {
    const members = await apiFetch(`/families/${familyId}/members`);
    currentFamilyMembers = members;
    renderMembersList(members);
  } catch (error) {
    alert("Не удалось загрузить участников: " + error.message);
  }
}

function renderMembersList(members, searchQuery = "") {
  ui.membersList.innerHTML = "";
  
  const filtered = searchQuery
    ? members.filter(m => {
        const name = `${m.first_name || ""} ${m.last_name || ""} ${m.username || ""}`.toLowerCase();
        return name.includes(searchQuery.toLowerCase());
      })
    : members;
  
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "members-empty";
    empty.textContent = searchQuery ? "Участники не найдены" : "Нет участников";
    ui.membersList.appendChild(empty);
    return;
  }
  
  filtered.forEach(member => {
    const item = document.createElement("div");
    item.className = `member-item ${member.blocked ? "blocked" : ""}`;
    
    // Аватар (простой круг с первой буквой имени)
    const avatar = document.createElement("div");
    avatar.className = "member-avatar";
    const initial = (member.first_name?.[0] || member.username?.[0] || "?").toUpperCase();
    avatar.textContent = initial;
    item.appendChild(avatar);
    
    // Информация о пользователе
    const info = document.createElement("div");
    info.className = "member-info";
    const name = document.createElement("div");
    name.className = "member-name";
    const fullName = [member.first_name, member.last_name].filter(Boolean).join(" ") || member.username || `ID: ${member.user_id}`;
    name.textContent = fullName;
    info.appendChild(name);
    
    if (member.username) {
      const username = document.createElement("div");
      username.className = "member-username";
      username.textContent = `@${member.username}`;
      info.appendChild(username);
    }
    
    const role = document.createElement("div");
    role.className = "member-role";
    role.textContent = member.role === "owner" ? "Создатель" : "Участник";
    if (member.blocked) {
      role.textContent += " (заблокирован)";
    }
    info.appendChild(role);
    
    item.appendChild(info);
    
    // Кнопки действий (только для владельца и не для себя)
    const actions = document.createElement("div");
    actions.className = "member-actions";
    
    // Проверяем, является ли текущий пользователь владельцем
    // (нужно будет добавить проверку через API или хранить в state)
    if (member.role === "owner") {
      const ownerBadge = document.createElement("span");
      ownerBadge.className = "owner-badge";
      ownerBadge.textContent = "Создатель";
      actions.appendChild(ownerBadge);
    } else {
      // Кнопка блокировки/разблокировки
      const blockBtn = document.createElement("button");
      blockBtn.className = "member-action-btn";
      blockBtn.textContent = member.blocked ? "Разблокировать" : "Заблокировать";
      blockBtn.onclick = (e) => {
        e.stopPropagation();
        toggleBlockMember(member.user_id, member.blocked);
      };
      actions.appendChild(blockBtn);
      
      // Кнопка удаления
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "member-action-btn member-action-btn-danger";
      deleteBtn.textContent = "X";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        removeMember(member.user_id, fullName);
      };
      actions.appendChild(deleteBtn);
    }
    
    item.appendChild(actions);
    ui.membersList.appendChild(item);
  });
}

async function toggleBlockMember(userId, isBlocked) {
  const action = isBlocked ? "unblock" : "block";
  const confirmText = isBlocked 
    ? "Разблокировать участника?"
    : "Заблокировать участника? Он не сможет видеть задачи группы.";
  
  if (!confirm(confirmText)) return;
  
  try {
    await apiFetch(`/families/${currentFamilyId}/members/${userId}/${action}`, { method: "POST" });
    await loadFamilyMembers(currentFamilyId);
  } catch (error) {
    alert("Ошибка: " + error.message);
  }
}

async function removeMember(userId, memberName) {
  if (!confirm(`Вы действительно хотите удалить "${memberName}" из группы?`)) return;
  
  try {
    await apiFetch(`/families/${currentFamilyId}/members/${userId}`, { method: "DELETE" });
    await loadFamilyMembers(currentFamilyId);
  } catch (error) {
    alert("Ошибка: " + error.message);
  }
}

function setupListeners() {
  // Навигация по месяцам
  if (ui.btnBack) {
    ui.btnBack.addEventListener("click", () => {
      state.currentMonth = new Date(
        state.currentMonth.getFullYear(),
        state.currentMonth.getMonth() - 1,
        1
      );
      fetchTasks();
    });
  }

  if (ui.btnForward) {
    ui.btnForward.addEventListener("click", () => {
      state.currentMonth = new Date(
        state.currentMonth.getFullYear(),
        state.currentMonth.getMonth() + 1,
        1
      );
      fetchTasks();
    });
  }

  ui.btnCancelFamily.addEventListener("click", closeFamilyModal);
  
  ui.btnSaveFamily.addEventListener("click", createFamily);

  // Модальное окно участников
  if (ui.btnCloseMembers) {
    ui.btnCloseMembers.addEventListener("click", closeMembersModal);
  }
  
  if (ui.membersModal) {
    ui.membersModal.addEventListener("click", (e) => {
      if (e.target === ui.membersModal) closeMembersModal();
    });
  }
  
  // Поиск участников
  if (ui.membersSearchInput) {
    ui.membersSearchInput.addEventListener("input", (e) => {
      renderMembersList(currentFamilyMembers, e.target.value);
    });
  }

  // Закрытие по клику вне окна (опционально)
  ui.familyModal.addEventListener("click", (e) => {
    if (e.target === ui.familyModal) closeFamilyModal();
  });

  // Обработка выбора группы
  if (ui.familySelect) {
    ui.familySelect.addEventListener("change", (event) => {
      const familyId = event.target.value;
      if (familyId) {
        state.scope = { type: "family", familyId: Number(familyId) };
      } else {
        state.scope = { type: "personal", familyId: null };
      }
    });
  }

  // Обработка уведомлений - отключение "за час" если нет времени
  const startTimeInput = ui.taskForm?.elements["start_time"];
  const notifyHourChip = document.getElementById("notify-hour");
  if (startTimeInput && notifyHourChip) {
    const updateNotifyHourAvailability = () => {
      const hasStartTime = startTimeInput.value && startTimeInput.value.trim() !== "";
      const checkbox = notifyHourChip.previousElementSibling;
      if (checkbox) {
        checkbox.disabled = !hasStartTime;
        if (!hasStartTime && checkbox.checked) {
          checkbox.checked = false;
        }
      }
    };
    startTimeInput.addEventListener("input", updateNotifyHourAvailability);
    startTimeInput.addEventListener("change", updateNotifyHourAvailability);
    updateNotifyHourAvailability();
  }

  if (ui.taskForm) {
    ui.taskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(ui.taskForm);
      const payload = Object.fromEntries(formData.entries());
      
      // Определяем scope на основе выбранной группы
      if (payload.family_id) {
        payload.scope = "family";
        payload.family_id = Number(payload.family_id);
      } else {
        payload.scope = "personal";
        payload.family_id = null;
      }
      
      payload.start_time = payload.start_time || null;
      payload.end_time = payload.end_time || null;
      if (payload.start_time && payload.end_time && payload.end_time < payload.start_time) {
        alert("Время окончания должно быть позже начала");
        return;
      }

      // Обработка тегов
      if (payload.tags && payload.tags.trim()) {
        payload.tags = payload.tags.split(",").map(t => t.trim()).filter(t => t.length > 0);
        if (payload.tags.length === 0) payload.tags = null;
      } else {
        payload.tags = null;
      }

      // Обработка цвета (из радио-кнопок)
      payload.color = payload.color || "#4c6fff";
      if (!/^#[0-9A-Fa-f]{6}$/.test(payload.color)) {
        payload.color = "#4c6fff"; // Дефолтный цвет
      }

      // Обработка уведомлений (чипы)
      const notify15min = ui.taskForm.elements["notify_15min"]?.checked;
      const notifyHour = ui.taskForm.elements["notify_hour"]?.checked;
      const notifyDay = ui.taskForm.elements["notify_day"]?.checked;
      
      // Уведомление за 15 минут (если нужно в будущем)
      // payload.notify_before_minutes = notify15min ? 15 : null;
      
      // Уведомление за день работает всегда
      payload.notify_before_days = notifyDay ? 1 : null;
      
      // Уведомление за час работает только если указано время начала
      payload.notify_before_hours = (notifyHour && payload.start_time) ? 1 : null;

      // Удаляем служебные поля
      delete payload["notify_15min"];
      delete payload["notify_day"];
      delete payload["notify_hour"];

      try {
        await apiFetch("/tasks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        ui.taskForm.reset();
        // Восстанавливаем значения по умолчанию
        if (ui.taskForm.elements["color-blue"]) {
          ui.taskForm.elements["color-blue"].checked = true;
        }
        syncFormDate();
        syncFormScope();
        closeTaskForm();
        fetchTasks();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  // Переключение видов
  if (ui.btnViewCalendar) {
    ui.btnViewCalendar.addEventListener("click", () => {
      if (state.viewMode !== "calendar") {
        state.viewMode = "calendar";
        renderCurrentView();
      }
    });
  }

  if (ui.btnViewKanban) {
    ui.btnViewKanban.addEventListener("click", () => {
      if (state.viewMode !== "kanban") {
        state.viewMode = "kanban";
        renderCurrentView();
        renderKanban();
      }
    });
  }
  
  // FAB кнопка для открытия формы
  if (ui.fabAddTask) {
    ui.fabAddTask.addEventListener("click", () => {
      openTaskForm();
    });
  }
  
  // Закрытие bottom sheet при клике на overlay
  if (ui.taskFormOverlay) {
    ui.taskFormOverlay.addEventListener("click", () => {
      closeTaskForm();
    });
  }
  
  // Закрытие bottom sheet при клике на handle
  const handle = document.querySelector(".bottom-sheet__handle");
  if (handle) {
    handle.addEventListener("click", () => {
      closeTaskForm();
    });
  }

  // Настройка количества дней в канбане
  if (ui.kanbanDaysSelect) {
    ui.kanbanDaysSelect.value = state.kanbanDaysCount;
    ui.kanbanDaysSelect.addEventListener("change", (event) => {
      state.kanbanDaysCount = parseInt(event.target.value, 10);
      renderKanban();
    });
  }

}



function renderCurrentView() {
  const isCalendar = state.viewMode === "calendar";
  if (ui.calendarView) ui.calendarView.classList.toggle("hidden", !isCalendar);
  if (ui.kanbanView) ui.kanbanView.classList.toggle("hidden", isCalendar);
  if (ui.btnViewCalendar) ui.btnViewCalendar.classList.toggle("active", isCalendar);
  if (ui.btnViewKanban) ui.btnViewKanban.classList.toggle("active", !isCalendar);
  if (isCalendar) {
    renderCalendar();
  } else {
    renderKanban();
  }
}

function openTaskForm() {
  if (ui.taskFormSheet) {
    ui.taskFormSheet.classList.add("open");
    if (ui.taskFormOverlay) {
      ui.taskFormOverlay.classList.add("open");
    }
    syncFormDate();
    syncFormScope();
    if (ui.taskForm && ui.taskForm.elements["title"]) {
      setTimeout(() => ui.taskForm.elements["title"].focus(), 300);
    }
  }
}

function closeTaskForm() {
  if (ui.taskFormSheet) {
    ui.taskFormSheet.classList.remove("open");
    if (ui.taskFormOverlay) {
      ui.taskFormOverlay.classList.remove("open");
    }
    if (ui.taskForm) {
      ui.taskForm.reset();
      // Восстанавливаем значения по умолчанию
      const colorBlue = ui.taskForm.elements["color-blue"];
      if (colorBlue) colorBlue.checked = true;
      syncFormDate();
      syncFormScope();
    }
  }
}

function buildMonthDays() {
  const { start, end } = monthBounds(state.currentMonth);
  const days = [];
  const iter = new Date(start);
  while (iter <= end) {
    days.push(new Date(iter));
    iter.setDate(iter.getDate() + 1);
  }
  return days;
}

function buildKanbanDays() {
  if (state.kanbanDaysCount === 0) {
    // Показать весь месяц
    return buildMonthDays();
  }
  
  // Показать определенное количество дней, начиная с сегодня или выбранной даты
  const startDate = new Date(state.selectedDate);
  const days = [];
  for (let i = 0; i < state.kanbanDaysCount; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    days.push(date);
  }
  return days;
}

function renderKanban() {
  if (!ui.kanbanBoard) return;
  ui.kanbanBoard.innerHTML = "";
  const days = buildKanbanDays();
  days.forEach((day) => {
    const key = formatISO(day);
    const column = document.createElement("div");
    column.className = "week-column";
    column.dataset.date = key;

    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("drop-target");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drop-target"));
    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("drop-target");
      const taskId = event.dataTransfer.getData("taskId");
      if (taskId) moveTaskToDate(Number(taskId), key);
    });
    
    // Клик по колонке открывает форму для создания задачи
    column.addEventListener("click", (event) => {
      if (event.target.closest(".week-column__add")) return;
      if (event.target.closest(".week-task-card")) return;
      setSelectedDateFromISO(key);
      openTaskForm();
    });
    
    // Заголовок колонки
    const header = document.createElement("div");
    header.className = "week-column__header";
    
    const dateSpan = document.createElement("div");
    dateSpan.className = "week-column__date";
    const dayName = day.toLocaleDateString("ru-RU", { weekday: "short" });
    const dayNum = day.getDate();
    const month = day.toLocaleDateString("ru-RU", { month: "short" });
    dateSpan.textContent = `${dayName}, ${dayNum} ${month}`;
    header.appendChild(dateSpan);
    
    const tasksForDay = state.taskMap[key] || [];
    tasksForDay.sort(sortTasks);
    
    if (tasksForDay.length > 0) {
      const count = document.createElement("div");
      count.className = "week-column__count";
      count.textContent = `${tasksForDay.length}`;
      header.appendChild(count);
    }
    
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "week-column__add";
    addBtn.innerHTML = "+";
    addBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setSelectedDateFromISO(key);
      openTaskForm();
    });
    header.appendChild(addBtn);
    
    column.appendChild(header);

    // Список задач
    const list = document.createElement("div");
    list.className = "week-column__list";

    tasksForDay.forEach((task) => {
      const card = document.createElement("div");
      card.className = "week-task-card";
      card.draggable = true;
      card.dataset.taskId = task.id;
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("taskId", String(task.id));
      });

      // Цветная полоса слева
      const colorBar = document.createElement("div");
      colorBar.className = "week-task-card__color-bar";
      colorBar.style.background = task.color || "var(--primary)";
      card.appendChild(colorBar);

      const content = document.createElement("div");
      content.className = "week-task-card__content";

      const title = document.createElement("div");
      title.className = "week-task-card__title";
      title.textContent = task.title;
      if (task.title.length > 50) {
        card.title = task.title;
      }
      content.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "week-task-card__meta";
      const metaParts = [];
      const time = formatTimeRange(task);
      if (time) metaParts.push(time);
      if (task.scope === "family" && task.family_id) {
        const family = state.families.find((f) => f.id === task.family_id);
        if (family) metaParts.push(family.name);
      }
      meta.textContent = metaParts.join(" • ") || "";
      content.appendChild(meta);

      // Теги
      if (task.tags && task.tags.length > 0) {
        const tagsContainer = document.createElement("div");
        tagsContainer.className = "week-task-card__tags";
        task.tags.forEach(tag => {
          const tagEl = document.createElement("span");
          tagEl.className = "task-tag";
          tagEl.textContent = tag;
          tagsContainer.appendChild(tagEl);
        });
        content.appendChild(tagsContainer);
      }

      card.appendChild(content);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "week-task-card__delete";
      deleteBtn.textContent = "✕";
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        confirmDelete(task.id);
      });
      card.appendChild(deleteBtn);

      list.appendChild(card);
    });

    column.appendChild(list);
    ui.kanbanBoard.appendChild(column);
  });
}

async function moveTaskToDate(taskId, newDate) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.date === newDate) return;

  const prevDate = task.date;
  task.date = newDate;
  state.taskMap[prevDate] = (state.taskMap[prevDate] || []).filter((t) => t.id !== taskId);
  state.taskMap[newDate] = [...(state.taskMap[newDate] || []), task];
  state.taskMap[newDate].sort(sortTasks);

  renderCurrentView();
  if (formatISO(state.selectedDate) === prevDate) renderTaskList();
  try {
    await apiFetch(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ date: newDate }),
    });
  } catch (error) {
    console.error("Error updating task:", error);
    alert("Не удалось обновить задачу: " + error.message);
    // откат
    task.date = prevDate;
    state.taskMap[newDate] = (state.taskMap[newDate] || []).filter((t) => t.id !== taskId);
    state.taskMap[prevDate] = [...(state.taskMap[prevDate] || []), task];
    state.taskMap[prevDate].sort(sortTasks);
    renderCurrentView();
  }
}

async function confirmDelete(taskId) {
  const agree = confirm("Удалить задачу?");
  if (!agree) return;
  try {
    await apiFetch(`/tasks/${taskId}`, { method: "DELETE" });
    await fetchTasks();
  } catch (error) {
    alert("Не удалось удалить: " + error.message);
  }
}

function setSelectedDateFromISO(dateISO) {
  state.selectedDate = parseISO(dateISO);
  syncFormDate();
  if (state.viewMode === "calendar") {
    renderCalendar();
    renderTaskList();
  } else {
    renderKanban();
  }
}

function sortTasks(a, b) {
  const timeA = a.start_time || "";
  const timeB = b.start_time || "";
  if (timeA === timeB) return a.title.localeCompare(b.title);
  if (!timeA) return 1;
  if (!timeB) return -1;
  return timeA.localeCompare(timeB);
}

async function init() {
  // #region agent log
  agentLog({
    location: "webapp/app.js:init:entry",
    message: "init_entry",
    data: {
      appVersion: APP_VERSION,
      isDevelopment,
      hasTg: !!tg,
      hasInitData: !!tg?.initData,
      debugUserId: state.debugUserId,
      initialScopeType: state.scope?.type,
      initialScopeFamilyId: state.scope?.familyId,
    },
    runId: "pre-fix",
    hypothesisId: "A",
  });
  // #endregion

  try {
    await authenticate();
    
    // Сначала проверяем, не пришли ли мы по приглашению
    await checkInvite(); 

    await loadFamilies(); // Теперь загружаем семьи (включая новую, если вступили)

    // #region agent log
    agentLog({
      location: "webapp/app.js:init:afterLoadFamilies",
      message: "after_loadFamilies",
      data: {
        familiesCount: Array.isArray(state.families) ? state.families.length : null,
        scopeType: state.scope?.type,
        scopeFamilyId: state.scope?.familyId,
      },
      runId: "pre-fix",
      hypothesisId: "D",
    });
    // #endregion

    syncFormDate();
    syncFormScope();
    setupListeners();
    await fetchTasks();
    renderCurrentView();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

init();


