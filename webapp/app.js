const tg = window.Telegram?.WebApp;
const params = new URLSearchParams(window.location.search);

const state = {
  token: null,
  debugUserId: params.get("debug_user"),
  families: [],
  scope: { type: "personal", familyId: null },
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: new Date(),
  tasks: [],
  taskMap: {},
  viewMode: "calendar", // "calendar" | "kanban"
};

const ui = {
  monthLabel: document.getElementById("month-label"),
  calendarGrid: document.getElementById("calendar-grid"),
  calendarView: document.getElementById("calendar-view"),
  kanbanView: document.getElementById("kanban-view"),
  kanbanBoard: document.getElementById("kanban-board"),
  selectedDate: document.getElementById("selected-date"),
  taskList: document.getElementById("task-list"),
  scopeChips: document.getElementById("scope-chips"),
  btnPrev: document.getElementById("btn-prev-month"),
  btnNext: document.getElementById("btn-next-month"),
  btnViewCalendar: document.getElementById("btn-view-calendar"),
  btnViewKanban: document.getElementById("btn-view-kanban"),
  taskForm: document.getElementById("task-form"),
  taskTemplate: document.getElementById("task-item-template"),
  familyModal: document.getElementById("family-modal"),
  inputFamilyName: document.getElementById("new-family-name"),
  btnSaveFamily: document.getElementById("btn-save-family"),
  btnCancelFamily: document.getElementById("btn-cancel-family"),
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
  return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
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
  const select = ui.taskForm.elements["family_id"];
  select.innerHTML = '<option value="">Не выбрана</option>';
  state.families.forEach((family) => {
    const option = document.createElement("option");
    option.value = family.id;
    option.textContent = family.name;
    select.appendChild(option);
  });
  select.disabled = !state.families.length;
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
      const shareBtn = document.createElement("button");
      shareBtn.className = "share-btn";
      shareBtn.innerHTML = "🔗"; // Или иконка
      shareBtn.title = "Пригласить участника";
      shareBtn.onclick = (e) => {
        e.stopPropagation(); // Чтобы не кликнулся сам чипс
        const family = state.families.find((f) => f.id === scope.familyId);
        if (family) {
          shareFamilyInvite(scope.familyId, scope.label, family.invite_code);
        }
      };
      chip.appendChild(shareBtn);

      const leaveBtn = document.createElement("button");
      leaveBtn.className = "leave-btn";
      leaveBtn.innerHTML = "✕"; 
      leaveBtn.title = "Покинуть семью";
      leaveBtn.onclick = (e) => {
        e.stopPropagation();
        const family = state.families.find((f) => f.id === scope.familyId);
        if (family) {
          leaveFamily(scope.familyId, family.name);
        }
      };
      chip.appendChild(leaveBtn);
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
  ui.monthLabel.textContent = russianMonth(state.currentMonth);

  days.forEach((day) => {
    const cell = document.createElement("div");
    cell.className = "day";
    if (day.getMonth() !== state.currentMonth.getMonth()) {
      cell.classList.add("outside");
    }
    if (formatISO(day) === formatISO(state.selectedDate)) {
      cell.classList.add("selected");
    }
    const header = document.createElement("div");
    header.className = "day__header";
    header.textContent = day.getDate();
    cell.appendChild(header);

    const key = formatISO(day);
    const tasksForDay = state.taskMap[key] || [];
    if (tasksForDay.length) {
      const dot = document.createElement("span");
      dot.className = "dot";
      cell.appendChild(dot);

      const taskList = document.createElement("div");
      taskList.className = "day__tasks";
      tasksForDay.slice(0, 2).forEach((task) => {
        const chip = document.createElement("div");
        chip.className = "day-task-chip";
        const timeRange = formatTimeRange(task);
        if (timeRange) {
          const time = document.createElement("span");
          time.className = "day-task-chip__time";
          time.textContent = timeRange;
          chip.appendChild(time);
        }
        const title = document.createElement("span");
        title.textContent = task.title;
        chip.appendChild(title);
        taskList.appendChild(chip);
      });
      if (tasksForDay.length > 2) {
        const more = document.createElement("div");
        more.className = "day-task-chip";
        more.textContent = `+${tasksForDay.length - 2} ещё`;
        taskList.appendChild(more);
      }
      cell.appendChild(taskList);
    }
    cell.addEventListener("click", () => {
      state.selectedDate = day;
      renderCalendar();
      renderTaskList();
      syncFormDate();
    });
    ui.calendarGrid.appendChild(cell);
  });
}

function renderTaskList() {
  const key = formatISO(state.selectedDate);
  const tasks = state.taskMap[key] || [];
  ui.selectedDate.textContent = formatDateHuman(state.selectedDate);
  ui.taskList.innerHTML = "";
  if (!tasks.length) {
    const empty = document.createElement("li");
    empty.textContent = "Пока нет задач";
    empty.className = "task-item";
    ui.taskList.appendChild(empty);
    return;
  }

  tasks.forEach((task) => {
    const node = ui.taskTemplate.content.cloneNode(true);
    node.querySelector(".task-item__title").textContent = task.title;
    const descEl = node.querySelector(".task-item__description");
    if (task.description) {
      descEl.textContent = task.description;
    } else {
      descEl.remove();
    }
    const meta = [];
    const time = formatTimeRange(task);
    if (time) meta.push(time);
    if (task.scope === "family" && task.family_id) {
      const family = state.families.find((f) => f.id === task.family_id);
      if (family) meta.push(family.name);
    }
    node.querySelector(".task-item__meta").textContent = meta.join(" • ");
    const deleteBtn = node.querySelector(".task-item__delete");
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      confirmDelete(task.id);
    });
    ui.taskList.appendChild(node);
  });
}

function syncFormDate() {
  ui.taskForm.elements["date"].value = formatISO(state.selectedDate);
}

function syncFormScope() {
  const scopeSelect = ui.taskForm.elements["scope"];
  scopeSelect.value = state.scope.type;
  const familySelect = ui.taskForm.elements["family_id"];
  if (state.scope.type === "family" && state.scope.familyId) {
    familySelect.value = state.scope.familyId;
    familySelect.disabled = false;
  } else {
    familySelect.value = "";
    familySelect.disabled = state.families.length === 0;
  }
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

    // Обновляем список семей и закрываем окно
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
        alert("Вы успешно вступили в семью!");
        // Перезагружаем список семей, чтобы новая семья появилась в списке
        await loadFamilies();
      } catch (error) {
        console.error(error);
        alert("Не удалось вступить в семью: " + error.message);
      }
    }
  }
}

async function leaveFamily(familyId, familyName) {
  if (!confirm(`Вы действительно хотите покинуть семью "${familyName}"?`)) return;
  try {
    await apiFetch(`/families/${familyId}/leave`, { method: "DELETE" });
    alert(`Вы покинули семью "${familyName}"`);
    
    // Если мы были в этой семье, переключаемся на личное
    if (state.scope.type === "family" && Number(state.scope.familyId) === Number(familyId)) {
        state.scope = { type: "personal", familyId: null };
        syncFormScope();
    }
    
    await loadFamilies();
    await fetchTasks(); // Перезагружаем задачи, т.к. семейные больше недоступны
  } catch (error) {
    alert("Не удалось покинуть семью: " + error.message);
  }
}

function setupListeners() {
  ui.btnPrev.addEventListener("click", () => {
    state.currentMonth = new Date(
      state.currentMonth.getFullYear(),
      state.currentMonth.getMonth() - 1,
      1
    );
    fetchTasks();
  });

  ui.btnNext.addEventListener("click", () => {
    state.currentMonth = new Date(
      state.currentMonth.getFullYear(),
      state.currentMonth.getMonth() + 1,
      1
    );
    fetchTasks();
  });

  ui.btnCancelFamily.addEventListener("click", closeFamilyModal);
  
  ui.btnSaveFamily.addEventListener("click", createFamily);

  // Закрытие по клику вне окна (опционально)
  ui.familyModal.addEventListener("click", (e) => {
    if (e.target === ui.familyModal) closeFamilyModal();
  });

  ui.taskForm.elements["scope"].addEventListener("change", (event) => {
    const value = event.target.value;
    const familySelect = ui.taskForm.elements["family_id"];
    if (value === "family") {
      familySelect.disabled = false;
      if (!familySelect.value && state.families[0]) {
        familySelect.value = state.families[0].id;
      }
    } else {
      familySelect.value = "";
      familySelect.disabled = state.families.length === 0;
    }
  });

  ui.taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(ui.taskForm);
    const payload = Object.fromEntries(formData.entries());
    payload.scope = payload.scope || "personal";
    payload.family_id = payload.family_id ? Number(payload.family_id) : null;
    if (payload.scope === "family" && !payload.family_id) {
      alert("Выбери семейный календарь");
      return;
    }
    payload.start_time = payload.start_time || null;
    payload.end_time = payload.end_time || null;
    if (payload.start_time && payload.end_time && payload.end_time < payload.start_time) {
      alert("Время окончания должно быть позже начала");
      return;
    }

    try {
      await apiFetch("/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      ui.taskForm.reset();
      syncFormDate();
      syncFormScope();
      fetchTasks();
    } catch (error) {
      alert(error.message);
    }
  });

  ui.btnViewCalendar.addEventListener("click", () => {
    if (state.viewMode !== "calendar") {
      state.viewMode = "calendar";
      renderCurrentView();
    }
  });

  ui.btnViewKanban.addEventListener("click", () => {
    if (state.viewMode !== "kanban") {
      state.viewMode = "kanban";
      renderCurrentView();
      renderKanban();
    }
  });
}

function renderCurrentView() {
  const isCalendar = state.viewMode === "calendar";
  ui.calendarView.classList.toggle("hidden", !isCalendar);
  ui.kanbanView.classList.toggle("hidden", isCalendar);
  ui.btnViewCalendar.classList.toggle("active", isCalendar);
  ui.btnViewKanban.classList.toggle("active", !isCalendar);
  if (isCalendar) {
    renderCalendar();
  } else {
    renderKanban();
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

function renderKanban() {
  ui.kanbanBoard.innerHTML = "";
  const days = buildMonthDays();
  days.forEach((day) => {
    const key = formatISO(day);
    const column = document.createElement("div");
    column.className = "kanban__column";
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
    column.addEventListener("click", (event) => {
      if (event.target.closest(".kanban__add")) return;
      setSelectedDateFromISO(key);
      ui.taskForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const header = document.createElement("div");
    header.className = "kanban__column-header";
    header.innerHTML = `<span>${day.getDate()} ${day.toLocaleDateString("ru-RU", { month: "short" })}</span>`;
    const count = document.createElement("span");
    count.className = "kanban__count";
    const tasksForDay = state.taskMap[key] || [];
    tasksForDay.sort(sortTasks);
    count.textContent = `${tasksForDay.length}`;
    header.appendChild(count);
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "kanban__add";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setSelectedDateFromISO(key);
      ui.taskForm.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => ui.taskForm.elements["title"].focus(), 500);
    });
    header.appendChild(addBtn);
    column.appendChild(header);

    const list = document.createElement("div");
    list.className = "kanban__list";

    tasksForDay.forEach((task) => {
      const card = document.createElement("div");
      card.className = "kanban-card";
      card.draggable = true;
      card.dataset.taskId = task.id;
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("taskId", String(task.id));
      });

      const title = document.createElement("div");
      title.className = "kanban-card__title";
      title.textContent = task.title;
      card.appendChild(title);

      if (task.description) {
        const desc = document.createElement("div");
        desc.className = "kanban-card__description";
        desc.textContent = task.description;
        card.appendChild(desc);
      }

      const meta = document.createElement("div");
      meta.className = "kanban-card__meta";
      const metaParts = [];
      const time = formatTimeRange(task);
      if (time) metaParts.push(time);
      if (task.scope === "family" && task.family_id) {
        const family = state.families.find((f) => f.id === task.family_id);
        if (family) metaParts.push(family.name);
      }
      meta.textContent = metaParts.join(" • ") || "Без времени";
      card.appendChild(meta);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "kanban__delete";
      deleteBtn.textContent = "Удалить";
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
  renderTaskList();
  renderCalendar();
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
  try {
    await authenticate();
    
    // Сначала проверяем, не пришли ли мы по приглашению
    await checkInvite(); 

    await loadFamilies(); // Теперь загружаем семьи (включая новую, если вступили)
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


