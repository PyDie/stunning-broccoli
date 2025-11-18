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
};

const ui = {
  monthLabel: document.getElementById("month-label"),
  calendarGrid: document.getElementById("calendar-grid"),
  selectedDate: document.getElementById("selected-date"),
  taskList: document.getElementById("task-list"),
  scopeChips: document.getElementById("scope-chips"),
  btnPrev: document.getElementById("btn-prev-month"),
  btnNext: document.getElementById("btn-next-month"),
  taskForm: document.getElementById("task-form"),
  taskTemplate: document.getElementById("task-item-template"),
  familyModal: document.getElementById("family-modal"),
  inputFamilyName: document.getElementById("new-family-name"),
  btnSaveFamily: document.getElementById("btn-save-family"),
  btnCancelFamily: document.getElementById("btn-cancel-family"),
};

function formatISO(date) {
  return date.toISOString().split("T")[0];
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
        shareBtn.onclick = (e) => {
            e.stopPropagation(); // Чтобы не кликнулся сам чипс
            shareFamilyInvite(scope.familyId, scope.label);
        };
        chip.appendChild(shareBtn);
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
    cell.textContent = day.getDate();
    const key = formatISO(day);
    if (state.taskMap[key]?.length) {
      const dot = document.createElement("span");
      dot.className = "dot";
      cell.appendChild(dot);
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
        descEl.remove(); // Удаляем элемент, если описания нет
    }
    const meta = [];
    if (task.start_time) meta.push(task.start_time.slice(0, 5));
    if (task.scope === "family" && task.family_id) {
      const family = state.families.find((f) => f.id === task.family_id);
      if (family) meta.push(family.name);
    }
    node.querySelector(".task-item__meta").textContent = meta.join(" • ");
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
  renderCalendar();
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

function shareFamilyInvite(familyId, familyName) {
  // ЗАМЕНИТЕ НА ВАШИ ДАННЫЕ ИЗ BOTFATHER
  const botUsername = "calendarbottestbot"; 
  const appName = "calendar"; // Short name вашего web app
  
  // Формируем startapp параметр
  const startParam = `invite_${familyId}`;
  
  // Полная ссылка на приложение
  const inviteLink = `https://t.me/${botUsername}/${appName}?startapp=${startParam}`;
  
  // Текст сообщения
  const text = `Присоединяйся к моему календарю "${familyName}"!`;
  
  // Используем нативный метод Telegram для шэринга
  const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
  tg.openTelegramLink(url);
}

async function checkInvite() {
  // Получаем start_param из Telegram
  const startParam = tg.initDataUnsafe?.start_param;
  
  // Проверяем, есть ли параметр и начинается ли он с invite_
  if (startParam && startParam.startsWith("invite_")) {
    const familyId = startParam.split("_")[1];
    
    if (familyId) {
      const confirmJoin = confirm(`Вы хотите вступить в семью (ID: ${familyId})?`);
      if (!confirmJoin) return;

      try {
        await apiFetch(`/families/${familyId}/join`, { method: "POST" });
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
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

init();


