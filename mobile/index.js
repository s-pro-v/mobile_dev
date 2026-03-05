// --- CONFIG ---
function escapeHtml(str) {
    if (str == null) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
/** Pierwsze 3 litery nazwy (np. "Jan Kowalski" → "Jan", "Anna" → "Ann"). */
function first3Letters(name) {
    var s = (name && String(name).trim()) ? String(name).trim() : "";
    return s.substring(0, 3);
}
(function () {
    var d = function (s) { try { return atob(s); } catch (e) { return ""; } };
    window.__G = {
        u: d("cy1wcm8tdg=="),
        r: d("anNvbi1saXN0YQ=="),
        s: d("bW9iaWxlLXcuanNvbg=="),
        f: d("dXN0YXdpZW5pYS5qc29u"),
        k: d("c2V0Lmpzb24=")
    };
})();
const GITHUB_USER = window.__G.u;
const GITHUB_REPO = window.__G.r;
const GITHUB_SCHEDULE_FILE = window.__G.s;
const GITHUB_SETTINGS_FILE = window.__G.f;
const GITHUB_SET_JSON_FILE = window.__G.k;
delete window.__G;
/** Główna ścieżka grafiku (repo s-pro-v/json-lista, plik mobile-grafik.json). */
const URL_SCHEDULE_MAIN = "https://raw.githubusercontent.com/s-pro-v/json-lista/refs/heads/main/mobile-grafik.json";
/** Fallback na gałąź master, gdy main nie odpowie. */
const URL_SCHEDULE_MASTER = "https://raw.githubusercontent.com/s-pro-v/json-lista/refs/heads/master/mobile-grafik.json";
/** Tryb testu: true gdy adres zawiera ?test (np. index.html?test). Używa tej samej ścieżki co główna. */
const useTestSchedule = typeof URLSearchParams !== "undefined" && new URLSearchParams(window.location.search).get("test") != null;
/** Sesja 2FA z logowanie.html (SYS.AUTH) – wymagana do wejścia na panel mobilny; po wylogowaniu czyścimy. */
const SYS_AUTH_2FA_STORAGE = "sys_auth_2fa_mobile";
/** Adres strony logowania (względem mobile/). */
const LOGIN_PAGE_URL = "../logowanie.html";
/** Ścieżka pliku stanu sesji (ten sam co w logowanie.html / admin). */
const STATE_FILE_PATH = "dev/sys_state.json";
/** URL pliku stanu (raw) – do weryfikacji, czy sesja nadal w active_sessions (admin nie wylogował). */
const URL_STATE = "https://raw.githubusercontent.com/" + GITHUB_USER + "/" + GITHUB_REPO + "/refs/heads/main/" + STATE_FILE_PATH;
/** URL API GitHub do odczytu/zapisu pliku stanu (wylogowanie z mobile → aktualizacja active_sessions). */
const GITHUB_API_STATE = "https://api.github.com/repos/" + GITHUB_USER + "/" + GITHUB_REPO + "/contents/" + STATE_FILE_PATH;
/** Klucz tokenu w localStorage (ten sam co w admin / logowanie) – do zapisu wylogowania w JSON. */
const GITHUB_PAT_STORAGE = "sys_auth_github_pat";
/** Nazwa admina – link do panelu admina widoczny tylko dla tego użytkownika (zgodnie z logowanie/admin). Zakodowane. */
const ADMIN_DISPLAY_NAME = (function () { try { return atob("Um9iZXJ0cw=="); } catch (e) { return ""; } })();
/** localStorage: ostatni znany meta.generated z JSON grafiku (GitHub) – do wykrywania nowej aktualizacji. */
const SCHEDULE_GENERATED_STORAGE = "app-schedule-generated";

/** Etykieta w nagłówku: data z JSON (mobile-grafik.json date). */
let headerUpdateLabel = "Aktualizacja";
/** true = nowe dane, jednorazowo podświetl datę do kolejnej aktualizacji. */
let headerUpdateIsNew = false;

/**
 * Sprawdza, czy użytkownik nadal ma dostęp (jest w active_sessions – admin go nie wylogował).
 * Nie sprawdzamy czasu last_active – na mobile sesja trwa do ręcznego wylogowania lub wylogowania przez admina.
 * Przy braku dostępu przekierowuje na logowanie. Przy błędzie sieci/parsowania nie wylogowuje.
 */
function checkAccessStillValid() {
    let userName;
    try {
        userName = localStorage.getItem(SYS_AUTH_2FA_STORAGE);
    } catch (e) {
        window.location.href = LOGIN_PAGE_URL + "?return=mobile";
        return;
    }
    if (!userName || !String(userName).trim()) {
        window.location.href = LOGIN_PAGE_URL + "?return=mobile";
        return;
    }
    const userKey = String(userName).toLowerCase().trim();
    const url = URL_STATE + "?t=" + Date.now();

    fetch(url)
        .then(function (res) { return res.ok ? res.text() : Promise.reject(new Error("state not ok")); })
        .then(function (text) {
            let data = { active_sessions: {} };
            try {
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed === "object") data = parsed;
            } catch (e) {
                return;
            }
            var sessions = data.active_sessions;
            if (!sessions || typeof sessions !== "object") sessions = {};
            var session = sessions[userKey];
            if (!session || typeof session !== "object") {
                try { localStorage.removeItem(SYS_AUTH_2FA_STORAGE); } catch (e) { }
                window.location.href = LOGIN_PAGE_URL + "?return=mobile";
            }
        })
        .catch(function () { });
}

function updateHeaderActiveKey() {
    const el = document.getElementById("active-key-display-header");
    if (!el) return;
    try {
        let label = escapeHtml(headerUpdateLabel);
        try {
            const userName = localStorage.getItem(SYS_AUTH_2FA_STORAGE);
            if (userName && userName.trim()) {
                label = "Zalogowany: " + escapeHtml(first3Letters(userName)) + " · " + label;
            }
        } catch (e) { }
        el.innerHTML = "<i data-lucide=\"refresh-cw\" class=\"update-icon-inline\" aria-hidden=\"true\"></i> " + label;
        if (headerUpdateIsNew) el.classList.add("update-new");
        else el.classList.remove("update-new");
        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    } catch (e) {
        el.textContent = "";
        el.classList.remove("update-new");
    }
}

/** Formatuje datę z JSON (ISO lub YYYY-MM-DD) na DD.MM.YYYY. */
function formatUpdateDate(str) {
    if (!str || typeof str !== "string") return "";
    const s = str.trim();
    if (s.length >= 10 && s.indexOf("T") !== -1) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4);
    return s;
}

/**
 * Pobiera datę z JSON (root date lub meta.date / meta.generated). Ustawia headerUpdateLabel na datę
 * i headerUpdateIsNew = true tylko przy pierwszym wejściu z nowymi danymi (potem zapis w localStorage).
 * @param {object} schedData - surowa odpowiedź (mobile-grafik.json), może mieć pole date
 * @param {Array} scheduleMonths - tablica miesięcy; meta.date / meta.generated brane z drugiego miesiąca (indeks 1), lub z pierwszego gdy jest tylko jeden
 */
function checkScheduleUpdate(schedData, scheduleMonths) {
    const list = Array.isArray(scheduleMonths) ? scheduleMonths : (scheduleMonths ? [scheduleMonths] : []);
    const monthForMeta = list.length >= 2 ? list[1] : (list.length > 0 ? list[0] : null);
    const rootDate = schedData && (schedData.date != null) ? String(schedData.date).trim() : "";
    const metaDate = monthForMeta && monthForMeta.meta && (monthForMeta.meta.date != null ? String(monthForMeta.meta.date).trim() : (monthForMeta.meta.generated ? String(monthForMeta.meta.generated).trim() : ""));
    const updateDate = rootDate || metaDate || "";
    if (!updateDate) {
        headerUpdateLabel = "Aktualizacja";
        headerUpdateIsNew = false;
        return;
    }
    try {
        const stored = localStorage.getItem(SCHEDULE_GENERATED_STORAGE) || "";
        headerUpdateIsNew = stored !== updateDate;
        headerUpdateLabel = formatUpdateDate(updateDate) || updateDate;
        localStorage.setItem(SCHEDULE_GENERATED_STORAGE, updateDate);
    } catch (e) {
        headerUpdateLabel = formatUpdateDate(updateDate) || "Aktualizacja";
        headerUpdateIsNew = false;
    }
}

/** Modal wylogowania – pokazuje overlay z potwierdzeniem w stylu strony. */
function showLogoutConfirmModal() {
    var overlay = document.getElementById("logout-confirm-overlay");
    if (overlay) {
        overlay.classList.remove("hidden");
        overlay.setAttribute("aria-hidden", "false");
        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    }
}

function closeLogoutConfirmModal() {
    const overlay = document.getElementById("logout-confirm-overlay");
    if (overlay) {
        overlay.classList.add("hidden");
        overlay.setAttribute("aria-hidden", "true");
    }
}

function getGitHubToken() {
    try {
        var t = localStorage.getItem(GITHUB_PAT_STORAGE);
        return (t && typeof t === "string") ? t.trim() : "";
    } catch (e) { return ""; }
}
function fromBase64(b64) {
    try {
        return decodeURIComponent(escape(atob(b64)));
    } catch (e) { return ""; }
}
function toBase64(str) {
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch (e) { return ""; }
}
/** Przy wylogowaniu z mobile – usuwa użytkownika z active_sessions i dopisuje audit_log w pliku stanu (jeśli jest token). */
function syncLogoutToGitHub(userName) {
    var token = getGitHubToken();
    if (!token || !userName || !String(userName).trim()) return Promise.resolve();
    var userKey = String(userName).trim().toLowerCase();
    var url = GITHUB_API_STATE + "?t=" + Date.now();
    return fetch(url, {
        headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3+json" }
    }).then(function (res) {
        if (!res.ok) return;
        return res.json();
    }).then(function (fileData) {
        if (!fileData || !fileData.content) return;
        var content = fromBase64(fileData.content).trim();
        var data = { active_sessions: {}, audit_log: [], pending_2fa: {}, access_permissions: {} };
        if (content) try { data = JSON.parse(content); } catch (e) { }
        data.active_sessions = data.active_sessions || {};
        data.audit_log = data.audit_log || [];
        if (!data.active_sessions[userKey]) return;
        delete data.active_sessions[userKey];
        var ts = new Date().toLocaleString("pl-PL");
        data.audit_log.unshift("[".concat(ts, "] USER_LOGOUT: ", userName.trim(), " wylogował się (mobile)."));
        if (data.audit_log.length > 100) data.audit_log.pop();
        var body = { message: "[SYS.AUTH] Wylogowanie (mobile): " + userName.trim(), content: toBase64(JSON.stringify(data, null, 2)) };
        if (fileData.sha) body.sha = fileData.sha;
        return fetch(GITHUB_API_STATE, {
            method: "PUT",
            headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    }).catch(function () { });
}
function doLogout() {
    var userName = "";
    try { userName = localStorage.getItem(SYS_AUTH_2FA_STORAGE) || ""; } catch (e) { }
    syncLogoutToGitHub(userName).finally(function () {
        try {
            localStorage.removeItem("accessKey");
            localStorage.removeItem("accessKeyDisplay");
            localStorage.removeItem("activeAccessKey");
            localStorage.removeItem(SYS_AUTH_2FA_STORAGE);
        } catch (e) { }
        location.reload();
    });
}

// --- STATE ---
let scheduleData = null;
/** Tablica miesięcy: [{ meta, workers }, ...]. Dla jednego miesiąca z JSON: [sched]. */
let scheduleMonths = [];
/** Indeks aktualnie wyświetlanego miesiąca (0 = pierwszy). */
let currentMonthIndex = 0;
let currentDayIndex = 0;
let currentView = "daily"; // 'daily' | 'individual'

// --- ELEMENTS ---
const loader = document.getElementById("loader");
const themeIcon = document.getElementById("theme-icon");
const resetDayBtn = document.querySelector(".reset-day-btn");

// Views
const viewDaily = document.getElementById("view-daily");
const viewIndividual = document.getElementById("view-individual");
const controlsDaily = document.getElementById("controls-daily");
const controlsIndividual = document.getElementById("controls-individual");
const btnViewDaily = document.getElementById("btn-view-daily");
const btnViewIndividual = document.getElementById("btn-view-individual");

// Individual Components
const workerSelectDisplay = document.getElementById("worker-select-display");
const workerSelectDropdown = document.getElementById("worker-select-dropdown");
const workerSelectOverlay = document.getElementById("worker-select-overlay");
const workerSelectWrapper = document.querySelector(".custom-select-wrapper");
const individualList = document.getElementById("individual-list");
let selectedWorkerId = null;

// Daily Components
const list1 = document.getElementById("list-1");
const listP1 = document.getElementById("list-p1");
const containerP1 = document.getElementById("container-p1");

const list2 = document.getElementById("list-2");
const listP2 = document.getElementById("list-p2");
const containerP2 = document.getElementById("container-p2");

const listOther = document.getElementById("list-other");
const listAbsent = document.getElementById("list-absent");

const labelDate = document.getElementById("current-date-display");
const labelName = document.getElementById("current-day-name");
const labelMonth = document.getElementById("month-label");

const count1El = document.getElementById("count-1");
const count2El = document.getElementById("count-2");
const countOtherEl = document.getElementById("count-other");
const countAbsentEl = document.getElementById("count-absent");

const dayOffsetMap = { PN: 0, WT: 1, SR: 2, ŚR: 2, CZ: 3, PT: 4, SO: 5, ND: 6 };

/** Do wyświetlania: usuwa "(8)" z końca kodu (np. 2(8) → 2, P2(8) → P2). */
function displayShiftCode(code) {
    if (code == null || code === "") return "-";
    const s = String(code).trim();
    if (!s) return "-";
    return s.replace(/\s*\(8\)\s*$/i, "").trim() || s;
}

// --- LOGIC HELPER: GROUP MAPPING ---

/**
 * Pobiera dane grupy (klasę CSS i nazwę) na podstawie ID pracownika i pliku ustawień.
 */
function getWorkerGroupInfo(id) {
    const workerId = parseInt(id);

    // Domyślne wartości (jeśli brak ustawień)
    let result = { className: "", name: "", code: "" };

    if (settingsData && settingsData.groups) {
        // Szukamy grupy, do której pasuje ID
        const group = settingsData.groups.find(
            (g) => workerId >= g.min && workerId <= g.max,
        );

        if (group) {
            result.className = `group-${group.code}`; // np. group-d
            result.name = group.name; // np. SEKCJA D
            result.code = group.code;

            // Generuje HTML badge'a
            result.badgeHtml = `<span class="group-badge ${result.className}"></span>`;
        }
    }

    return result;
}

// --- LOGIC: VIEW & RENDER ---

function switchView(viewName) {
    currentView = viewName;

    const viewSwitcherTabs = document.getElementById("view-switcher-tabs");
    const viewSwitcherBack = document.getElementById("view-switcher-back");

    if (viewName === "daily") {
        viewDaily.classList.remove("hidden");
        viewIndividual.classList.add("hidden");

        controlsDaily.classList.remove("hidden");
        controlsDaily.style.display = "flex";
        controlsIndividual.classList.add("hidden");
        controlsIndividual.style.display = "";

        btnViewDaily.classList.add("active");
        btnViewIndividual.classList.remove("active");

        viewSwitcherTabs.classList.remove("hidden");
        viewSwitcherBack.classList.add("hidden");
    } else {
        viewDaily.classList.add("hidden");
        viewIndividual.classList.remove("hidden");

        controlsDaily.classList.add("hidden");
        controlsIndividual.classList.remove("hidden");
        controlsIndividual.style.display = "flex";

        btnViewDaily.classList.remove("active");
        btnViewIndividual.classList.add("active");

        viewSwitcherTabs.classList.add("hidden");
        viewSwitcherBack.classList.remove("hidden");

        updateIndividualMonthDisplay();
        if (selectedWorkerId) renderIndividualSchedule();
    }
    lucide.createIcons();
}

function populateWorkerSelect() {
    if (!scheduleData) return;

    const sortedWorkers = [...scheduleData.workers].sort(
        (a, b) => parseInt(a.id) - parseInt(b.id),
    );

    workerSelectDropdown.innerHTML = "";

    sortedWorkers.forEach((worker) => {
        const groupInfo = getWorkerGroupInfo(worker.id);
        const groupBadge = groupInfo.badgeHtml || "";

        const option = document.createElement("div");
        option.className = "custom-select-option";
        option.dataset.workerId = worker.id;
        option.innerHTML = `
                  <div class="flex items-center gap-2">
                    <div class="avatar-small avatar-wrapper">
                      ${worker.name.charAt(0)}
                      ${groupBadge
                ? `<div class="badge-wrapper">${groupBadge}</div>`
                : ""
            }
                    </div>
                    <span>${worker.name}</span>
                  </div>
                `;

        option.onclick = () => selectWorker(worker.id, worker.name, groupBadge);
        workerSelectDropdown.appendChild(option);
    });

    function openWorkerSelectModal() {
        if (!workerSelectOverlay || !workerSelectWrapper) return;
        workerSelectOverlay.appendChild(workerSelectDropdown);
        workerSelectOverlay.classList.remove("hidden");
        workerSelectDropdown.classList.remove("hidden");
        workerSelectOverlay.setAttribute("aria-hidden", "false");
    }
    function closeWorkerSelectModal() {
        if (!workerSelectOverlay || !workerSelectWrapper) return;
        workerSelectWrapper.appendChild(workerSelectDropdown);
        workerSelectOverlay.classList.add("hidden");
        workerSelectDropdown.classList.add("hidden");
        workerSelectOverlay.setAttribute("aria-hidden", "true");
    }
    workerSelectDisplay.onclick = (e) => {
        e.stopPropagation();
        if (workerSelectDropdown.classList.contains("hidden")) openWorkerSelectModal();
        else closeWorkerSelectModal();
    };
    if (workerSelectOverlay) {
        workerSelectOverlay.onclick = function (e) {
            if (e.target === workerSelectOverlay) closeWorkerSelectModal();
        };
    }
}

function selectWorker(workerId, workerName, groupBadge) {
    selectedWorkerId = workerId;
    workerSelectDisplay.innerHTML = `
                <div class="flex items-center gap-2">
                  <div class="avatar-small avatar-wrapper">
                    ${workerName.charAt(0)}
                    ${groupBadge
            ? `<div class="badge-wrapper">${groupBadge}</div>`
            : ""
        }
                  </div>
                  <span>${workerName}</span>
                </div>
              `;
    if (workerSelectOverlay) {
        workerSelectWrapper?.appendChild(workerSelectDropdown);
        workerSelectOverlay.classList.add("hidden");
    }
    workerSelectDropdown.classList.add("hidden");
    renderIndividualSchedule();
}

/** Podgląd na pracownika – wyświetla tylko dane z aktualnie wybranego miesiąca (scheduleData). */
function renderIndividualSchedule() {
    if (!selectedWorkerId || !scheduleData) return;

    const worker = scheduleData.workers.find((w) => w.id == selectedWorkerId);
    if (!worker) return;

    individualList.innerHTML = "";
    const days = scheduleData.meta.days;
    const weekdays = scheduleData.meta.weekdays;
    const monthLabel = (scheduleData.meta && scheduleData.meta.month) ? scheduleData.meta.month : "";

    /* Tylko zmiany dla tego miesiąca – luty 28, marzec 31; bez „dobijania” do 31. */
    const shiftsForMonth = Array.isArray(worker.shifts) ? worker.shifts.slice(0, days.length) : [];

    // Use Helper Function for Group Info
    const groupInfo = getWorkerGroupInfo(worker.id);
    const groupBadge = groupInfo.badgeHtml || "";
    const groupName = groupInfo.name || "BRAK PRZYDZIAŁU";

    // Stats Logic – tylko dla dni danego miesiąca
    let totalHours = 0;
    let shift1Count = 0;
    let shift2Count = 0;
    let shiftP1Count = 0;
    let shiftP2Count = 0;
    let otherShifts = 0;
    let workDays = 0;

    shiftsForMonth.forEach((shift) => {
        if (!shift) return;
        const code = shift.toUpperCase();
        if (
            [
                "X",
                "U",
                "ZW",
                "L4",
                "OPIEKA",
                "UW",
                "W",
                "NN",
                "CH",
                "WYP",
                "SZKOLENIE",
                "URLOP",
            ].includes(code)
        )
            return;
        workDays++;
        if (code === "P1" || code === "NP1") {
            shiftP1Count++;
            totalHours += 12;
        } else if (code === "P2" || code === "NP2") {
            shiftP2Count++;
            totalHours += 12;
        } else if (code.includes("1")) {
            shift1Count++;
            totalHours += 12;
        } else if (code.includes("2")) {
            shift2Count++;
            totalHours += 12;
        } else {
            otherShifts++;
            totalHours += 8;
        }
    });

    // HEADER (tylko wybrany miesiąc)
    const headerDiv = document.createElement("div");
    headerDiv.className = "worker-header";
    headerDiv.innerHTML = `
                  <div class="avatar-wrapper">
                    <div class="avatar">
                      ${worker.name.charAt(0)}
                    </div>
                    ${groupBadge ? `<div class="badge-wrapper">${groupBadge}</div>` : ""}
                  </div>
                  <div class="worker-info">
                    <div class="worker-info-name">${worker.name}</div>
                    <div class="worker-info-group">${groupName}</div>
                    ${monthLabel ? `<div class="worker-info-month" aria-label="Miesiąc">${monthLabel}</div>` : ""}
                  </div>
                `;
    individualList.appendChild(headerDiv);

    // STATS
    const statsDiv1 = document.createElement("div");
    statsDiv1.className = "stats-grid stats-grid-3";
    statsDiv1.innerHTML = `
                <div class="stat-card">
                  <div class="stat-value stat-hours">${totalHours}h</div>
                  <div class="stat-label">Godziny</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${workDays}</div>
                  <div class="stat-label">Dni pracy</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value stat-other">${otherShifts}</div>
                  <div class="stat-label">Inne</div>
                </div>
              `;
    individualList.appendChild(statsDiv1);

    const statsDiv2 = document.createElement("div");
    statsDiv2.className = "stats-grid stats-grid-4";
    statsDiv2.innerHTML = `
                <div class="stat-card">
                  <div class="stat-value stat-shift1">${shift1Count}</div>
                  <div class="stat-label stat-label-small">Zmiana 1</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value stat-shift2">${shift2Count}</div>
                  <div class="stat-label stat-label-small">Zmiana 2</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value stat-shift1">${shiftP1Count}</div>
                  <div class="stat-label stat-label-small">P1</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value stat-shift2">${shiftP2Count}</div>
                  <div class="stat-label stat-label-small">P2</div>
                </div>
              `;
    individualList.appendChild(statsDiv2);

    // GRID HEADERS (PN, WT...)
    const dayHeaders = ["PN", "WT", "ŚR", "CZ", "PT", "SO", "ND"];
    dayHeaders.forEach((dh) => {
        const hCell = document.createElement("div");
        hCell.className = "calendar-header-cell";
        hCell.innerText = dh;
        individualList.appendChild(hCell);
    });

    // GRID OFFSET
    // Assume meta.weekdays[0] corresponds to meta.days[0].
    // Find which day of the week the first day is.
    const firstDayWeekName = weekdays[0];
    const offset = dayOffsetMap[firstDayWeekName] || 0;

    for (let i = 0; i < offset; i++) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "individual-row calendar-empty-cell";
        individualList.appendChild(emptyCell);
    }

    // DAYS – tylko dni tego miesiąca (days.length = 28/29/30/31)
    const today = new Date().getDate().toString();
    days.forEach((dayNum, index) => {
        const shiftCode = shiftsForMonth[index];
        const weekday = weekdays[index];

        const row = document.createElement("div");
        row.className = "individual-row";
        if (dayNum == today) row.classList.add("current-day-highlight");
        if (weekday === "SO" || weekday === "ND") row.classList.add("weekend-row");

        // Style for the code inside the grid
        let codeStyle = "color: var(--text-muted);";
        if (shiftCode) {
            const sc = shiftCode.toUpperCase();
            if (sc.includes("1")) codeStyle = "color: var(--blue-color);";
            if (sc.includes("2")) codeStyle = "color: var(--highlight-color);";
            if (["L4", "U", "X", "URLOP"].includes(sc))
                codeStyle = "color: var(--danger-color);";
        }

        // Handling long text
        let displayCodeClass = "shift-code-centered";
        if (shiftCode && shiftCode.length > 3) {
            displayCodeClass += " shift-code-small-text";
        }

        row.innerHTML = `
                    <div class="day-info">
                        <span class="day-number">${dayNum}</span>
                    </div>
                    <div class="${displayCodeClass}" style="${codeStyle}">
                        ${displayShiftCode(shiftCode)}
                    </div>
                `;
        individualList.appendChild(row);
    });
}

function getShiftType(shiftCode) {
    if (!shiftCode || shiftCode === "" || shiftCode === "-") return "ABSENT";
    const code = shiftCode.toUpperCase();
    const absentCodes = [
        "X",
        "U",
        "ZW",
        "L4",
        "OPIEKA",
        "UW",
        "W",
        "NN",
        "CH",
        "WYP",
        "SZKOLENIE",
        "URLOP",
    ];
    if (absentCodes.includes(code)) return "ABSENT";
    if (code === "P1" || code === "NP1") return "SHIFT_P1";
    if (code === "P2" || code === "NP2") return "SHIFT_P2";
    if (code.includes("1")) return "SHIFT_1";
    if (code.includes("2")) return "SHIFT_2";
    return "OTHER";
}

function createWorkerCard(worker, shiftCode, dayIndex) {
    const div = document.createElement("div");
    div.className = "worker-card";
    div.style.cursor = "pointer";
    let badgeClass = "shift-badge";
    const sc = shiftCode.toUpperCase();

    if (sc === "P1" || sc === "NP1") badgeClass += " badge-shift-1";
    else if (sc === "P2" || sc === "NP2") badgeClass += " badge-shift-2";
    else if (sc.includes("1")) badgeClass += " badge-shift-1";
    else if (sc.includes("2")) badgeClass += " badge-shift-2";
    else if (
        [
            "X",
            "U",
            "ZW",
            "L4",
            "OPIEKA",
            "UW",
            "W",
            "NN",
            "CH",
            "WYP",
            "SZKOLENIE",
            "URLOP",
        ].includes(sc)
    )
        badgeClass += " badge-absent";
    else badgeClass += " style-shift-other";

    // Dynamic Group Badge
    const groupInfo = getWorkerGroupInfo(worker.id);
    const groupBadge = groupInfo.badgeHtml || "";

    div.innerHTML = `
                <div class="flex items-center gap-2">
                    <div class="avatar avatar-wrapper">
                        ${worker.name.charAt(0)}
                        ${groupBadge
            ? `<div class="badge-wrapper">${groupBadge}</div>`
            : ""
        }
                    </div>
                    <span class="worker-name">${worker.name}</span>
                </div>
                <div class="${badgeClass}">
                    ${displayShiftCode(shiftCode)}
                </div>
            `;

    div.onclick = () => {
        selectWorker(worker.id, worker.name, groupBadge);
        switchView("individual");
    };

    return div;
}

function renderSchedule() {
    if (!scheduleData) return;

    const dayNumber = scheduleData.meta.days[currentDayIndex];
    const dayName = scheduleData.meta.weekdays[currentDayIndex];
    const monthName = scheduleData.meta.month;

    labelDate.innerText = `${dayNumber} ${monthName}`;
    labelName.innerText = getFullDayName(dayName);

    if (scheduleMonths.length <= 1 && labelMonth) {
        const today = new Date().getDate();
        labelMonth.innerHTML = `DATA: <span class="day-number-highlight">${today}</span> `;
    }

    list1.innerHTML = "";
    listP1.innerHTML = "";
    list2.innerHTML = "";
    listP2.innerHTML = "";
    listOther.innerHTML = "";
    listAbsent.innerHTML = "";
    containerP1.classList.add("hidden");
    containerP2.classList.add("hidden");

    let c1 = 0,
        cP1 = 0,
        c2 = 0,
        cP2 = 0,
        cO = 0,
        cAbsent = 0;

    scheduleData.workers.forEach((worker) => {
        const shiftCode = worker.shifts[currentDayIndex] || "";
        const type = getShiftType(shiftCode);
        const card = createWorkerCard(worker, shiftCode || "-", currentDayIndex);

        switch (type) {
            case "SHIFT_1":
                list1.appendChild(card);
                c1++;
                break;
            case "SHIFT_P1":
                listP1.appendChild(card);
                cP1++;
                break;
            case "SHIFT_2":
                list2.appendChild(card);
                c2++;
                break;
            case "SHIFT_P2":
                listP2.appendChild(card);
                cP2++;
                break;
            case "OTHER":
                listOther.appendChild(card);
                cO++;
                break;
            case "ABSENT":
                // Special rendering for absent list to match your style
                const groupInfo = getWorkerGroupInfo(worker.id);
                const groupBadge = groupInfo.badgeHtml || "";

                const displayCode = displayShiftCode(shiftCode);
                const emptyClass = !shiftCode ? " badge-empty" : "";
                card.innerHTML = `
                          <div class="flex items-center gap-2">
                            <div class="avatar avatar-wrapper">
                              ${worker.name.charAt(0)}
                              ${groupBadge
                        ? `<div class="badge-wrapper">${groupBadge}</div>`
                        : ""
                    }
                            </div>
                            <span class="worker-name">${worker.name}</span>
                          </div>
                          <div class="shift-badge badge-absent${emptyClass}">
                            ${displayCode}
                          </div>
                        `;
                card.onclick = () => {
                    selectWorker(worker.id, worker.name, groupBadge);
                    switchView("individual");
                };
                listAbsent.appendChild(card);
                cAbsent++;
                break;
        }
    });

    if (cP1 > 0) containerP1.classList.remove("hidden");
    if (cP2 > 0) containerP2.classList.remove("hidden");

    count1El.innerText = c1 + cP1;
    count2El.innerText = c2 + cP2;
    countOtherEl.innerText = cO;
    countAbsentEl.innerText = cAbsent;

    const emptyMsg = `<div class="empty-message">SYSTEM OFFLINE / BRAK DANYCH</div>`;
    if (c1 === 0 && cP1 === 0) list1.innerHTML = emptyMsg;
    if (c2 === 0 && cP2 === 0) list2.innerHTML = emptyMsg;

    const sectionOther = document.getElementById("section-other");
    if (cO === 0) sectionOther.style.display = "none";
    else sectionOther.style.display = "block";

    lucide.createIcons();
}

function getFullDayName(short) {
    const map = {
        PN: "PONIEDZIAŁEK",
        WT: "WTOREK",
        SR: "ŚRODA",
        ŚR: "ŚRODA",
        CZ: "CZWARTEK",
        PT: "PIĄTEK",
        SO: "SOBOTA",
        ND: "NIEDZIELA",
    };
    return map[short] || short;
}

function changeDay(delta) {
    if (!scheduleData) return;
    const max = scheduleData.meta.days.length - 1;
    let newIndex = currentDayIndex + delta;
    if (newIndex < 0) newIndex = 0;
    if (newIndex > max) newIndex = max;
    currentDayIndex = newIndex;
    renderSchedule();
    updateResetDayButton();
}

function changeMonth(delta) {
    if (scheduleMonths.length <= 1) return;
    let newIdx = currentMonthIndex + delta;
    if (newIdx < 0) newIdx = 0;
    if (newIdx >= scheduleMonths.length) newIdx = scheduleMonths.length - 1;
    if (!hasMonthData(scheduleMonths[newIdx])) {
        if (delta > 0) {
            for (let i = newIdx - 1; i >= 0; i--) {
                if (hasMonthData(scheduleMonths[i])) { newIdx = i; break; }
            }
        } else {
            for (let i = newIdx + 1; i < scheduleMonths.length; i++) {
                if (hasMonthData(scheduleMonths[i])) { newIdx = i; break; }
            }
        }
    }
    setMonthByIndex(newIdx);
}

/** Zwraca true, gdy miesiąc ma dane do wyświetlenia (meta.days i workers). */
function hasMonthData(m) {
    return m && m.meta && Array.isArray(m.meta.days) && m.meta.days.length > 0 && Array.isArray(m.workers);
}

/** Ustawia aktualny miesiąc po indeksie (0-based). Gdy wybrany miesiąc nie ma danych, pokazuje poprzedni z danymi. */
function setMonthByIndex(idx) {
    if (scheduleMonths.length === 0 || idx < 0 || idx >= scheduleMonths.length) return;
    let target = idx;
    if (!hasMonthData(scheduleMonths[target])) {
        for (let i = target - 1; i >= 0; i--) {
            if (hasMonthData(scheduleMonths[i])) {
                target = i;
                break;
            }
        }
    }
    currentMonthIndex = target;
    scheduleData = scheduleMonths[currentMonthIndex];
    /* Przy zmianie miesiąca zawsze pokazuj 1. dzień – luty ma 28 dni, marzec 31; unikamy „dobijania” indeksu do 31. */
    currentDayIndex = 0;
    if (selectedWorkerId && !(scheduleData.workers && scheduleData.workers.some((w) => w.id == selectedWorkerId))) {
        selectedWorkerId = null;
        if (workerSelectDisplay) workerSelectDisplay.innerHTML = "WYBIERZ...";
    }
    updateMonthSwitcher();
    populateWorkerSelect();
    renderSchedule();
    updateResetDayButton();
    if (currentView === "individual" && selectedWorkerId) renderIndividualSchedule();
    else if (currentView === "individual" && individualList) {
        individualList.innerHTML = "<div class=\"footer-info\" style=\"grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.8rem; margin-top: 2rem; opacity: 0.7;\">Wybierz pracownika z listy powyżej.</div>";
    }
    lucide.createIcons();
}

function updateMonthSwitcher() {
    refreshMonthsDropdown();
    updateIndividualMonthDisplay();
}

/** Aktualizuje etykietę i widoczność przełącznika miesiąca w widoku osobistym. */
function updateIndividualMonthDisplay() {
    const wrap = document.getElementById("individual-month-wrap");
    const display = document.getElementById("individual-month-display");
    if (!wrap || !display) return;
    if (scheduleMonths.length > 1 && scheduleData && scheduleData.meta) {
        wrap.style.display = "flex";
        display.textContent = scheduleData.meta.month || "";
    } else {
        wrap.style.display = "none";
    }
}

function refreshMonthsDropdown() {
    const listEl = document.getElementById("months-dropdown-list");
    const dropEl = document.getElementById("months-dropdown");
    if (!listEl || !dropEl) return;
    listEl.innerHTML = "";
    if (scheduleMonths.length <= 1) {
        dropEl.classList.add("hidden");
        dropEl.setAttribute("aria-hidden", "true");
        return;
    }
    scheduleMonths.forEach((m, i) => {
        const name = m.meta && m.meta.month ? m.meta.month : "Miesiąc " + (i + 1);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "month-item" + (i === currentMonthIndex ? " active" : "");
        btn.textContent = name;
        btn.dataset.monthIndex = String(i);
        btn.onclick = (e) => {
            e.stopPropagation();
            setMonthByIndex(i);
            closeMonthsDropdown();
        };
        listEl.appendChild(btn);
    });
}

function openMonthsDropdown() {
    const dropEl = document.getElementById("months-dropdown");
    if (dropEl && scheduleMonths.length > 1) {
        dropEl.classList.remove("hidden");
        dropEl.setAttribute("aria-hidden", "false");
    }
}

function closeMonthsDropdown() {
    const dropEl = document.getElementById("months-dropdown");
    if (dropEl) {
        dropEl.classList.add("hidden");
        dropEl.setAttribute("aria-hidden", "true");
    }
}

function toggleMonthsDropdown() {
    const dropEl = document.getElementById("months-dropdown");
    if (!dropEl) return;
    if (dropEl.classList.contains("hidden")) openMonthsDropdown();
    else closeMonthsDropdown();
}

function toggleAbsent() {
    const el = document.getElementById("list-absent");
    const text = document.getElementById("toggle-text");
    const isHidden = el.classList.contains("hidden");

    if (isHidden) {
        el.classList.remove("hidden");
        if (text) text.innerText = "Ukryj";
    } else {
        el.classList.add("hidden");
        if (text) text.innerText = "Pokaż";
    }
    lucide.createIcons();
}

/** Nazwy miesięcy po polsku (uppercase), indeks 0 = styczeń, do dopasowania meta.month. */
const MONTH_NAMES_PL = ["STYCZEŃ", "LUTY", "MARZEC", "KWIECIEŃ", "MAJ", "CZERWIEC", "LIPIEC", "SIERPIEŃ", "WRZESIEŃ", "PAŹDZIERNIK", "LISTOPAD", "GRUDZIEŃ"];

function goToToday() {
    if (scheduleMonths.length === 0) return;
    const now = new Date();
    const todayDay = now.getDate().toString();
    const currentMonthName = MONTH_NAMES_PL[now.getMonth()];

    /* Najpierw szukaj miesiąca po nazwie (LUTY, MARZEC), żeby 1 marca nie lądował w lutym. */
    for (let m = 0; m < scheduleMonths.length; m++) {
        const meta = scheduleMonths[m].meta;
        const monthName = (meta && meta.month) ? String(meta.month).trim().toUpperCase() : "";
        if (monthName !== currentMonthName) continue;
        const days = meta.days;
        if (!Array.isArray(days)) continue;
        const idx = days.findIndex((d) => d == todayDay);
        if (idx !== -1) {
            currentMonthIndex = m;
            scheduleData = scheduleMonths[m];
            currentDayIndex = idx;
            updateMonthSwitcher();
            populateWorkerSelect();
            renderSchedule();
            updateResetDayButton();
            if (currentView === "individual" && selectedWorkerId) renderIndividualSchedule();
            return;
        }
        /* Jest miesiąc, ale brak dnia (np. 31 w lutym) – weź 1. dzień. */
        currentMonthIndex = m;
        scheduleData = scheduleMonths[m];
        currentDayIndex = 0;
        updateMonthSwitcher();
        populateWorkerSelect();
        renderSchedule();
        updateResetDayButton();
        if (currentView === "individual" && selectedWorkerId) renderIndividualSchedule();
        return;
    }

    /* Fallback: brak dopasowania po nazwie (np. inna pisownia), szukaj po dniu – ostatni pasujący miesiąc. */
    let lastMatch = -1;
    for (let m = 0; m < scheduleMonths.length; m++) {
        const days = scheduleMonths[m].meta && scheduleMonths[m].meta.days;
        if (!Array.isArray(days)) continue;
        const idx = days.findIndex((d) => d == todayDay);
        if (idx !== -1) lastMatch = m;
    }
    if (lastMatch !== -1) {
        const days = scheduleMonths[lastMatch].meta.days;
        const idx = days.findIndex((d) => d == todayDay);
        currentMonthIndex = lastMatch;
        scheduleData = scheduleMonths[lastMatch];
        currentDayIndex = idx;
    } else {
        currentMonthIndex = 0;
        scheduleData = scheduleMonths[0];
        currentDayIndex = 0;
    }
    updateMonthSwitcher();
    populateWorkerSelect();
    renderSchedule();
    updateResetDayButton();
    if (currentView === "individual" && selectedWorkerId) renderIndividualSchedule();
}

function updateResetDayButton() {
    if (!scheduleData || !resetDayBtn) return;
    const today = new Date().getDate().toString();
    const todayIndex = scheduleData.meta.days.findIndex((d) => d == today);
    const notOnToday = todayIndex !== -1 && currentDayIndex !== todayIndex;
    const viewingOtherMonth = scheduleMonths.length > 1 && todayIndex === -1;
    if (notOnToday || viewingOtherMonth) {
        resetDayBtn.classList.add("active");
    } else {
        resetDayBtn.classList.remove("active");
    }
}

// --- THEME LOGIC ---
function initTheme() {
    const storedTheme = localStorage.getItem("app-theme");
    if (storedTheme === "light") {
        document.documentElement.removeAttribute("theme");
        updateThemeIcon("light");
    } else {
        document.documentElement.setAttribute("theme", "dark");
        updateThemeIcon("dark");
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("theme");
    if (currentTheme === "dark") {
        document.documentElement.removeAttribute("theme");
        localStorage.setItem("app-theme", "light");
        updateThemeIcon("light");
    } else {
        document.documentElement.setAttribute("theme", "dark");
        localStorage.setItem("app-theme", "dark");
        updateThemeIcon("dark");
    }
}

function updateThemeIcon(theme) {
    if (theme === "dark") {
        themeIcon.src =
            "https://raw.githubusercontent.com/skokivPr/img/refs/heads/main/grafik/light.png";
        themeIcon.style.filter = "brightness(1) invert(0)";
    } else {
        themeIcon.src =
            "https://raw.githubusercontent.com/skokivPr/img/refs/heads/main/grafik/light.png";
        themeIcon.style.filter = "brightness(0.7) invert(0)";
    }
    lucide.createIcons();
}

// --- DATA LOADING ---
function loadData() {
    const urlScheduleMain = URL_SCHEDULE_MAIN;
    const urlScheduleMaster = URL_SCHEDULE_MASTER;

    const urlSettingsMain = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/refs/heads/main/${GITHUB_SETTINGS_FILE}`;
    const urlSettingsMaster = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/refs/heads/master/${GITHUB_SETTINGS_FILE}`;

    console.log("[SYS] INICJOWANIE PROTOKOŁU POBIERANIA DANYCH..." + (useTestSchedule ? " [parametr ?test]" : "") + " Źródło: mobile-grafik.json (s-pro-v/json-lista)");

    const parseJsonResponse = (res, url) => {
        return res.text().then((text) => {
            try {
                return JSON.parse(text);
            } catch (e) {
                const full = text.replace(/\n/g, " ");
                const shortMsg = e.message && e.message.includes("JSON") ? "Nieprawidłowy format JSON." : e.message;
                throw new Error(
                    `Odpowiedź nie jest JSON. Odpowiedź: "${full}". ${shortMsg}`
                );
            }
        });
    };

    const fetchWithFallback = (urlMain, urlFallback) => {
        return fetch(urlMain).then((res) => {
            if (res.ok) return parseJsonResponse(res, urlMain);
            console.warn(`[SYS] Błąd pobierania ${urlMain}, próba fallback...`);
            return fetch(urlFallback).then((r) => {
                if (!r.ok) throw new Error(`Fallback też nie OK: ${r.status}`);
                return parseJsonResponse(r, urlFallback);
            });
        });
    };

    const doFetch = () => Promise.all([
        fetchWithFallback(urlScheduleMain, urlScheduleMaster),
        fetchWithFallback(urlSettingsMain, urlSettingsMaster).catch((err) => {
            console.error(
                "[SYS] Błąd pobierania ustawień. Używam domyślnych (pustych).",
                err,
            );
            return { groups: [] };
        }),
    ])
        .then(([schedData, settData]) => {
            settingsData = settData;
            // Obsługa JSON: pojedynczy miesiąc { meta, workers } lub wiele miesięcy { months: [ { meta, workers }, ... ] }
            if (schedData && Array.isArray(schedData.months) && schedData.months.length > 0) {
                scheduleMonths = schedData.months;
            } else if (schedData && schedData.meta && Array.isArray(schedData.workers)) {
                scheduleMonths = [schedData];
            } else {
                scheduleMonths = [];
            }
            currentMonthIndex = 0;
            for (let i = 0; i < scheduleMonths.length; i++) {
                if (hasMonthData(scheduleMonths[i])) {
                    currentMonthIndex = i;
                    break;
                }
            }
            scheduleData = scheduleMonths.length > 0 ? scheduleMonths[currentMonthIndex] : null;
            checkScheduleUpdate(schedData, scheduleMonths);
            console.log("[SYS] DANE ZAŁADOWANE POMYŚLNIE." + (scheduleMonths.length > 1 ? " Miesięcy: " + scheduleMonths.length : ""));
            loader.classList.add("hidden");
            viewDaily.classList.remove("hidden");
            populateWorkerSelect();
            updateMonthSwitcher();
            goToToday();
            updateHeaderActiveKey();
        })
        .catch((err) => {
            console.error("[SYS] Błąd głównego źródła:", err);
            if (!useTestSchedule) {
                console.log("[SYS] Próba fallback: grafik testowy (mobile-grafik.json)...");
                return fetch(URL_SCHEDULE_MAIN)
                    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
                    .then((schedData) => {
                        if (schedData && Array.isArray(schedData.months) && schedData.months.length > 0) {
                            scheduleMonths = schedData.months;
                        } else if (schedData && schedData.meta && Array.isArray(schedData.workers)) {
                            scheduleMonths = [schedData];
                        } else {
                            scheduleMonths = [];
                        }
                        settingsData = { groups: [] };
                        currentMonthIndex = 0;
                        for (let i = 0; i < scheduleMonths.length; i++) {
                            if (hasMonthData(scheduleMonths[i])) {
                                currentMonthIndex = i;
                                break;
                            }
                        }
                        scheduleData = scheduleMonths.length > 0 ? scheduleMonths[currentMonthIndex] : null;
                        checkScheduleUpdate(schedData, scheduleMonths);
                        console.log("[SYS] Załadowano grafik testowy. Miesięcy: " + scheduleMonths.length);
                        loader.classList.add("hidden");
                        viewDaily.classList.remove("hidden");
                        populateWorkerSelect();
                        updateMonthSwitcher();
                        goToToday();
                        updateHeaderActiveKey();
                    })
                    .catch((err2) => {
                        console.error("[SYS] Fallback też nie zadziałał:", err2);
                        loader.innerHTML = "<div class=\"error-view\"><section class=\"error-section\"><p class=\"error-title\">Błąd ładowania grafiku</p><p style=\"margin:1rem 0;font-size:0.9rem;\">Nie udało się pobrać danych. Aby zobaczyć grafik testowy (3 miesiące), otwórz stronę z parametrem <strong>?test</strong>:</p><p style=\"margin:0.5rem 0;\"><a href=\"?test\" style=\"color:var(--highlight-color);\">" + window.location.pathname.split("/").pop() + "?test</a></p><button onclick=\"location.reload()\" class=\"btn btn-primary\" style=\"margin-top:1rem;\">Odśwież</button></section></div>";
                        lucide.createIcons();
                    });
                return;
            }
            loader.innerHTML = `
                        <div class="error-view">
                            <section class="error-section error-section-header">
                                <i data-lucide="alert-triangle" class="error-icon"></i>
                                <p class="error-title">BŁĄD KRYTYCZNY</p>
                            </section>
                            <section class="error-section error-section-status">
                                <div class="error-status-container">
                                    <p class="error-status"><i data-lucide="construction" class="error-status-icon"></i></p>
                                    <p class="error-status-text"><span>STATUS:</span> TRWA MODERNIZACJA...</p>
                                </div>
                            </section>
                            <section class="error-section error-section-message">
                                <div class="error-info-package">
                                    <div class="error-info-package-title"><i data-lucide="package" class="error-info-icon"></i> Pakiet informacji</div>
                                    <dl class="error-info-list">
                                        <div class="error-info-row">
                                            <dt class="error-info-label">Błąd</dt>
                                            <dd class="error-info-value">${escapeHtml(err.message)}</dd>
                                        </div>
                                        <div class="error-info-row">
                                            <dt class="error-info-label">Typ</dt>
                                            <dd class="error-info-value">${escapeHtml(err.name || 'Nieznany')}</dd>
                                        </div>
                                        <div class="error-info-row">
                                            <dt class="error-info-label">Źródło</dt>
                                            <dd class="error-info-value">Pobieranie danych z GitHub</dd>
                                        </div>
                                        <div class="error-info-row">
                                            <dt class="error-info-label">Repo</dt>
                                            <dd class="error-info-value">---------.json</dd>
                                        </div>
                                        <div class="error-info-row">
                                            <dt class="error-info-label">Pliki</dt>
                                            <dd class="error-info-value">---------.json</dd>
                                        </div>
                                        <div class="error-info-row">
                                            <dt class="error-info-label">Czas</dt>
                                            <dd class="error-info-value">${new Date().toLocaleString('pl-PL')}</dd>
                                        </div>
                                    </dl>
                                </div>
                                <div class="error-webhooks-block">
                                    <div class="error-webhooks-title"><i data-lucide="webhook" class="error-info-icon"></i> Status</div>
                                    <p class="error-webhooks-desc">System nie może pobrać danych z repozytorium GitHub. Sprawdź połączenie sieciowe lub skontaktuj się z administratorem systemu.</p>
                                    <div class="error-contact-admin">
                                        <div class="error-contact-admin-icon"><i data-lucide="help-circle"></i></div>
                                        <div class="error-contact-admin-text">
                                            <span class="error-contact-admin-label">Kontakt z administratorem</span>
                                            <span class="error-contact-admin-hint">W razie problemów skontaktuj się z administratorem systemu</span>
                                        </div>
                                    </div>
                                </div>
                            </section>
                            <section class="error-section error-section-action">
                                <button onclick="showLogoutConfirmModal()" class="footer-btn error-btn">RESTART SYSTEMU</button>
                            </section>
                        </div>
                    `;
            lucide.createIcons();
        });

    doFetch();
}

// Modal wylogowania – delegacja (otwarcie + zamknięcie), działa też z GitHub Pages / iframe
window.showLogoutConfirmModal = showLogoutConfirmModal;
window.closeLogoutConfirmModal = closeLogoutConfirmModal;

document.addEventListener("click", function (e) {
    if (e.target.closest("[data-action=\"open-logout-modal\"]")) {
        showLogoutConfirmModal();
        return;
    }
    var overlay = document.getElementById("logout-confirm-overlay");
    if (!overlay || overlay.classList.contains("hidden")) return;
    if (e.target === overlay) {
        closeLogoutConfirmModal();
        return;
    }
    if (e.target.closest("#logout-confirm-cancel")) {
        closeLogoutConfirmModal();
        return;
    }
    if (e.target.closest("#logout-confirm-ok")) {
        doLogout();
        closeLogoutConfirmModal();
    }
}, false);

/** Uruchamia fn gdy DOM gotowy; działa też po osadzeniu (iframe), gdy DOMContentLoaded już minął. */
function whenReady(fn) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", fn);
    } else {
        fn();
    }
}

whenReady(function () {
    /* Brak możliwości cofania (przycisk Wstecz). */
    (function () {
        if (typeof history === "undefined" || !history.pushState) return;
        history.pushState(null, "", location.href);
        window.addEventListener("popstate", function () { history.pushState(null, "", location.href); });
    })();

    /* Wymagana sesja z logowanie.html (SYS.AUTH 2FA). */
    try {
        if (!localStorage.getItem(SYS_AUTH_2FA_STORAGE)) {
            window.location.href = LOGIN_PAGE_URL + "?return=mobile";
            return;
        }
    } catch (e) {
        window.location.href = LOGIN_PAGE_URL + "?return=mobile";
        return;
    }

    initTheme();
    /* Panel admina tylko dla Robertsa. */
    (function () {
        var el = document.getElementById("link-admin-panel");
        if (!el) return;
        var userName = "";
        try { userName = (localStorage.getItem(SYS_AUTH_2FA_STORAGE) || "").trim(); } catch (e) { }
        var admin = (ADMIN_DISPLAY_NAME || "").trim().toLowerCase();
        if (admin && userName.toLowerCase() === admin) el.classList.remove("hidden");
        else el.classList.add("hidden");
    })();
    if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    loadData();

    var dateDisplayWrap = document.getElementById("date-display-wrap");
    if (dateDisplayWrap) {
        dateDisplayWrap.addEventListener("click", function (e) {
            if (e.target.closest("#months-dropdown")) return;
            if (scheduleMonths.length > 1) toggleMonthsDropdown();
        });
        dateDisplayWrap.addEventListener("keydown", function (e) {
            if ((e.key === "Enter" || e.key === " ") && scheduleMonths.length > 1) { e.preventDefault(); toggleMonthsDropdown(); }
        });
    }
    document.addEventListener("click", function (e) {
        if (!e.target.closest("#date-display-wrap")) closeMonthsDropdown();
        if (!e.target.closest(".custom-select-wrapper") && !e.target.closest("#worker-select-overlay") && workerSelectDropdown && !workerSelectDropdown.classList.contains("hidden")) {
            if (workerSelectOverlay && workerSelectWrapper) {
                workerSelectWrapper.appendChild(workerSelectDropdown);
                workerSelectOverlay.classList.add("hidden");
            }
            workerSelectDropdown.classList.add("hidden");
        }
    });

    var btnLogout = document.getElementById("btn-logout");
    if (btnLogout) btnLogout.addEventListener("click", function (e) { e.preventDefault(); showLogoutConfirmModal(); });

    var individualMonthPrev = document.getElementById("individual-month-prev");
    var individualMonthNext = document.getElementById("individual-month-next");
    if (individualMonthPrev) individualMonthPrev.addEventListener("click", function () { changeMonth(-1); lucide.createIcons(); });
    if (individualMonthNext) individualMonthNext.addEventListener("click", function () { changeMonth(1); lucide.createIcons(); });

    /** Po powrocie do zakładki: sprawdź, czy nadal jest dostęp; potem ustaw dzisiejszy dzień. */
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible") return;
        checkAccessStillValid();
        if (scheduleMonths.length > 0) {
            goToToday();
            if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
        }
    });

    /** Okresowa weryfikacja dostępu (co 60 s). */
    setInterval(checkAccessStillValid, 60 * 1000);
});

whenReady(function () {
    // Remove draggable attribute from all elements
    document.querySelectorAll('[draggable="true"]').forEach((el) => {
        el.removeAttribute("draggable");
    });

    // Prevent dragstart event
    document.addEventListener("dragstart", function (e) {
        e.preventDefault();
        return false;
    });

    // Prevent drop event
    document.addEventListener("drop", function (e) {
        e.preventDefault();
        return false;
    });

    // Prevent dragover event
    document.addEventListener("dragover", function (e) {
        e.preventDefault();
        return false;
    });
});
