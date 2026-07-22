/**
 * PRE-CHECK: Automatyczne logowanie z weryfikacją ważności sesji (max 5 minut).
 * Zapobiega zacięciu w pętli przy nieaktywnym / starym wpisie w localStorage.
 */
(function () {
  var admin = (function () {
    try {
      return atob("Um9iZXJ0cw==");
    } catch (e) {
      return "";
    }
  })();
  if (!admin) return;

  try {
    var storedUser = localStorage.getItem("sys_auth_2fa_mobile");
    var loginTime = localStorage.getItem("sys_auth_login_time");
    var now = Date.now();
    var SESSION_TIMEOUT_MS = 5 * 60 * 1000;

    if (storedUser && storedUser.trim().toLowerCase() === admin.toLowerCase()) {
      if (loginTime && now - parseInt(loginTime, 10) < SESSION_TIMEOUT_MS) {
        window.location.replace("mobile/index.html");
      } else {
        localStorage.removeItem("sys_auth_2fa_mobile");
        localStorage.removeItem("sys_auth_login_time");
      }
    }
  } catch (e) {}
})();

// --- KONFIGURACJA API I SESJI ---
const GITHUB_PAT_STORAGE = "sys_auth_github_pat";
const AUTH_JSON_URL =
  "https://raw.githubusercontent.com/s-pro-v/json-lista/refs/heads/main/dev/auth.json";
const XOR_KEY = atob("dzVn");
let GITHUB_PAT = null;

const REPO_OWNER = "s-pro-v";
const REPO_NAME = "json-lista";
const CREDENTIALS_FILE = "dev/key_f2a.json";
const STATE_FILE = "dev/sys_state.json";

const GLOBAL_PASS = (function () {
  try {
    return atob("c3RhcnQyNg==");
  } catch (e) {
    return "";
  }
})();
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const ADMIN_LOGIN_NAME = (function () {
  try {
    return atob("Um9iZXJ0cw==");
  } catch (e) {
    return "";
  }
})();
const ADMIN_PASS = (function () {
  try {
    return atob("YWRtaW4yNg==");
  } catch (e) {
    return "";
  }
})();

let IDENTITY_MATRIX = {};
let ACTIVE_USER = null;
let POLLING_INTERVAL = null;

const DOM = {
  step1: document.getElementById("step-1"),
  step2: document.getElementById("step-2"),
  userInput: document.getElementById("sys-user"),
  passInput: document.getElementById("sys-pass"),
  linkAdminPanel: document.getElementById("link-admin-panel"),
  linkMobilePanel: document.getElementById("link-mobile-panel"),
  loginBtn: document.getElementById("login-trigger"),
  authBtn: document.getElementById("auth-trigger"),
  userDisp: document.getElementById("current-user-display"),
  inputs: document.querySelectorAll(".crypt-input"),
  tokenContainer: document.getElementById("token-container"),
  status: document.getElementById("status-log"),
  themeBtn: document.getElementById("theme-btn"),
  resetCacheBtn: document.getElementById("reset-cache-btn"),
  cancelBtn: document.getElementById("cancel-trigger"),
  spinner: document.getElementById("wait-spinner"),
};

// Pomocnicze funkcje kodowania
const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));
const fromBase64 = (b64) => decodeURIComponent(escape(atob(b64)));

function xorDecode(base64Encoded, key) {
  const binary = atob(base64Encoded);
  let out = "";
  for (let i = 0; i < binary.length; i++) {
    out += String.fromCharCode(
      binary.charCodeAt(i) ^ key.charCodeAt(i % key.length),
    );
  }
  return out;
}

function updateLog(msg, state = "default") {
  if (!DOM.status) return;
  DOM.status.textContent = msg;
  DOM.status.className = "status-console";
  if (state === "success") DOM.status.classList.add("state-success");
  if (state === "error") DOM.status.classList.add("state-error");
  if (state === "warning") DOM.status.classList.add("state-warning");
}

// --- SILNIK GITHUB API (BEZ NAGŁÓWKÓW CACHE-CONTROL DLA CORS) ---

async function loadPat() {
  try {
    const pat =
      typeof localStorage !== "undefined" &&
      localStorage.getItem(GITHUB_PAT_STORAGE);
    if (pat && pat.trim() !== "") {
      GITHUB_PAT = pat.trim();
      return;
    }
  } catch (e) {}

  const res = await fetch(AUTH_JSON_URL + "?t=" + Date.now());
  if (!res.ok) throw new Error("auth.json " + res.status);
  const data = await res.json();
  const item = Array.isArray(data) ? data[0] : data;
  const enc = item && item.sys_pat;
  if (!enc) throw new Error("Brak sys_pat w auth.json");
  GITHUB_PAT = xorDecode(enc, XOR_KEY);
  try {
    localStorage.setItem(GITHUB_PAT_STORAGE, GITHUB_PAT);
  } catch (e) {}
}

async function githubGetFileSafe(path) {
  if (!GITHUB_PAT) throw new Error("Brak aktywnego klucza API");

  // Parametr ?t= chroni przed pamięcią podręczną bez wyzwalania błędów CORS
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?t=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_PAT}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (res.status === 404) {
    return {
      sha: null,
      data: {
        active_sessions: {},
        audit_log: [],
        pending_2fa: {},
        access_permissions: {},
      },
    };
  }
  if (!res.ok) throw new Error(`API GET Error: ${res.status}`);

  const fileData = await res.json();
  const content = fromBase64(fileData.content).trim();
  let parsedData = {
    active_sessions: {},
    audit_log: [],
    pending_2fa: {},
    access_permissions: {},
  };

  if (content) {
    try {
      parsedData = JSON.parse(content);
    } catch (e) {}
  }

  parsedData.pending_2fa = parsedData.pending_2fa || {};
  parsedData.access_permissions = parsedData.access_permissions || {};
  parsedData.active_sessions = parsedData.active_sessions || {};
  parsedData.audit_log = parsedData.audit_log || [];

  return { sha: fileData.sha, data: parsedData };
}

async function githubPutFileSafe(path, updateFn, commitMsg, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Pobierz aktualne SHA tuż przed zapisem
      const { sha, data } = await githubGetFileSafe(path);
      const updatedData = updateFn(data);

      const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
      const body = {
        message: commitMsg,
        content: toBase64(JSON.stringify(updatedData, null, 2)),
      };
      if (sha) body.sha = sha;

      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `token ${GITHUB_PAT}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 409 && attempt < retries) {
        // Konflikt SHA – ponów próbę z opóźnieniem
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }

      if (!res.ok) throw new Error(`API PUT Error: ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

// --- LOGIKA SESJI I LOGOWANIA ---

async function initCredentials() {
  if (!GITHUB_PAT) {
    updateLog("[KRYTYCZNE] Brak klucza API.", "error");
    return;
  }

  try {
    const fileRes = await githubGetFileSafe(CREDENTIALS_FILE);
    if (fileRes.data && fileRes.data.workers && fileRes.data.workers.length) {
      const adminKey = (ADMIN_LOGIN_NAME || "").trim().toLowerCase();
      fileRes.data.workers.forEach((w) => {
        if (!w.shifts || !w.shifts[2]) return;
        const canLogin = w.shifts[1] === "TRUE" || w.shifts[1] === true;
        const isAdmin =
          adminKey &&
          w.name &&
          String(w.name).trim().toLowerCase() === adminKey;
        if (canLogin || isAdmin) {
          const skip2fa =
            isAdmin || w.shifts[3] === "TRUE" || w.shifts[3] === true;
          IDENTITY_MATRIX[w.name.toLowerCase()] = {
            name: w.name,
            token: String(w.shifts[2]).replace(/\D/g, "").slice(0, 6),
            skip2fa: !!skip2fa,
          };
        }
      });
      if (Object.keys(IDENTITY_MATRIX).length) {
        updateLog(
          "[SYSTEM] Matryca wczytana. Gotowy do autoryzacji.",
          "success",
        );
        DOM.loginBtn.disabled = false;
        DOM.loginBtn.innerHTML =
          '<i class="fas fa-right-to-bracket"></i> Zainicjuj sesję';
      } else {
        updateLog("[SYSTEM] Brak uprawnionych węzłów.", "warning");
      }
    }
  } catch (e) {
    updateLog(`[BŁĄD API] Pobieranie danych: ${e.message}`, "error");
  }
}

async function handleLogin() {
  const u = DOM.userInput.value.toLowerCase().trim();
  const p = DOM.passInput.value.trim();
  const node = IDENTITY_MATRIX[u];
  const adminKey = (ADMIN_LOGIN_NAME || "").trim().toLowerCase();
  const isAdminLogin = adminKey && u === adminKey;

  if (!node) {
    updateLog("[ODMOWA] Nieprawidłowy Name lub brak uprawnień.", "error");
    return;
  }
  if (isAdminLogin ? p !== ADMIN_PASS : p !== GLOBAL_PASS) {
    updateLog("[ODMOWA] Nieprawidłowe hasło.", "error");
    return;
  }

  DOM.loginBtn.disabled = true;
  updateLog("[SYSTEM] Weryfikacja sesji...", "default");

  try {
    // Logowanie bezpośrednie (bez 2FA)
    if (node.skip2fa) {
      await githubPutFileSafe(
        STATE_FILE,
        (data) => {
          data.active_sessions[u] = {
            original_name: node.name,
            last_active: Date.now(),
          };
          data.audit_log.unshift(
            `[${new Date().toLocaleString("pl-PL")}] AUTH_SUCCESS: Direct -> ${node.name}`,
          );
          if (data.audit_log.length > 100) data.audit_log.pop();
          return data;
        },
        `[SYS.AUTH] Direct login: ${node.name}`,
      );

      localStorage.setItem("sys_auth_2fa_mobile", node.name);
      localStorage.setItem("sys_auth_login_time", Date.now());
      window.location.href = "mobile/index.html";
      return;
    }

    // Żądanie PUSH / 2FA
    DOM.loginBtn.innerHTML =
      '<i class="fas fa-right-to-bracket"></i> PRZESYŁANIE ŻĄDANIA...';

    await githubPutFileSafe(
      STATE_FILE,
      (data) => {
        var deviceInfo =
          typeof navigator !== "undefined" && navigator.userAgent
            ? navigator.userAgent
            : "";
        data.pending_2fa[u] = {
          time: Date.now(),
          token: (node.token || "").toString().slice(0, 6),
          device: deviceInfo,
        };
        return data;
      },
      `[SYS.AUTH] Żądanie PUSH: ${node.name}`,
    );

    ACTIVE_USER = node;
    DOM.step1.classList.add("hidden-step");
    DOM.step2.classList.remove("hidden-step");
    DOM.userDisp.textContent = node.name;
    updateLog(
      "[SYSTEM] Oczekiwanie na akceptację PUSH przez administratora...",
      "warning",
    );
    startPolling();
  } catch (e) {
    updateLog(`[BŁĄD API] Logowanie nieudane: ${e.message}`, "error");
    DOM.loginBtn.disabled = false;
    DOM.loginBtn.innerHTML =
      '<i class="fas fa-right-to-bracket"></i> Zainicjuj sesję';
  }
}

function startPolling() {
  const userKey = ACTIVE_USER.name.toLowerCase();

  POLLING_INTERVAL = setInterval(async () => {
    try {
      const { data } = await githubGetFileSafe(STATE_FILE);
      const status = data.access_permissions[userKey];

      if (status === "GRANTED") {
        clearInterval(POLLING_INTERVAL);
        updateLog(
          "[SYSTEM] Zezwolenie uzyskane. Generowanie kryptogramu...",
          "success",
        );
        DOM.spinner.style.display = "none";
        await autoTypeToken(ACTIVE_USER.token);
      } else if (status === "DENIED") {
        clearInterval(POLLING_INTERVAL);
        updateLog("[ODMOWA] Żądanie odrzucone przez administratora.", "error");
        DOM.spinner.style.display = "none";
        DOM.authBtn.innerHTML = '<i class="fas fa-xmark"></i> ODRZUCONO';
      }
    } catch (e) {
      console.warn("Polling status check:", e.message);
    }
  }, 4000);
}

async function autoTypeToken(token) {
  DOM.tokenContainer.classList.add("typing-active");
  const chars = token.split("");
  for (let i = 0; i < 6; i++) {
    if (DOM.inputs[i]) {
      DOM.inputs[i].value = chars[i];
      DOM.inputs[i].style.borderColor = "var(--accent-orange)";
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  finalizeSession();
}

async function finalizeSession() {
  try {
    const userKey = ACTIVE_USER.name.toLowerCase();

    await githubPutFileSafe(
      STATE_FILE,
      (data) => {
        if (data.access_permissions[userKey])
          delete data.access_permissions[userKey];
        data.active_sessions[userKey] = {
          original_name: ACTIVE_USER.name,
          last_active: Date.now(),
        };
        data.audit_log.unshift(
          `[${new Date().toLocaleString("pl-PL")}] AUTH_SUCCESS: PUSH -> ${ACTIVE_USER.name}`,
        );
        if (data.audit_log.length > 100) data.audit_log.pop();
        return data;
      },
      `[SYS.AUTH] Finalizacja sesji: ${ACTIVE_USER.name}`,
    );

    localStorage.setItem("sys_auth_2fa_mobile", ACTIVE_USER.name);
    localStorage.setItem("sys_auth_login_time", Date.now());

    if (DOM.linkMobilePanel) DOM.linkMobilePanel.classList.remove("hidden");
    DOM.authBtn.innerHTML = '<i class="fas fa-check"></i> TUNEL OTWARTY';
    window.location.href = "mobile/index.html";
  } catch (e) {
    updateLog(`[BŁĄD KRYTYCZNY] Zapis sesji: ${e.message}`, "error");
  }
}

async function handleCancel(e) {
  if (e) e.preventDefault();
  if (POLLING_INTERVAL) clearInterval(POLLING_INTERVAL);

  if (!ACTIVE_USER) {
    location.reload();
    return;
  }

  DOM.cancelBtn.textContent = "Zamykanie...";
  DOM.cancelBtn.style.pointerEvents = "none";

  try {
    const userKey = ACTIVE_USER.name.toLowerCase();
    await githubPutFileSafe(
      STATE_FILE,
      (data) => {
        if (data.pending_2fa[userKey]) delete data.pending_2fa[userKey];
        if (data.access_permissions[userKey])
          delete data.access_permissions[userKey];
        if (data.active_sessions[userKey]) delete data.active_sessions[userKey];
        data.audit_log.unshift(
          `[${new Date().toLocaleString("pl-PL")}] USER_LOGOUT: ${ACTIVE_USER.name}`,
        );
        return data;
      },
      `[SYS.AUTH] Anulowanie/Wylogowanie: ${ACTIVE_USER.name}`,
    );
  } catch (err) {
    console.error(err);
  } finally {
    localStorage.removeItem("sys_auth_2fa_mobile");
    localStorage.removeItem("sys_auth_login_time");
    location.reload();
  }
}

// Przycisk awaryjnego czyszczenia pamięci lokalnej
if (DOM.resetCacheBtn) {
  DOM.resetCacheBtn.addEventListener("click", () => {
    localStorage.removeItem("sys_auth_2fa_mobile");
    localStorage.removeItem("sys_auth_login_time");
    updateLog("[SYSTEM] Pamięć sesji podręcznej wyczyszczona.", "success");
    setTimeout(() => location.reload(), 400);
  });
}

// Bindowanie zdarzeń DOM
DOM.loginBtn.addEventListener("click", handleLogin);
DOM.cancelBtn.addEventListener("click", handleCancel);

if (DOM.userInput) {
  DOM.userInput.addEventListener("input", () => {
    const name = (DOM.userInput.value || "").trim().toLowerCase();
    const admin = (ADMIN_LOGIN_NAME || "").trim().toLowerCase();
    if (admin && name === admin && DOM.linkAdminPanel) {
      DOM.linkAdminPanel.classList.remove("hidden");
    } else if (DOM.linkAdminPanel) {
      DOM.linkAdminPanel.classList.add("hidden");
    }
  });
}

// Inicjalizacja uruchomieniowa
loadPat()
  .then(() => {
    initCredentials();
  })
  .catch((e) => updateLog("[BŁĄD INICJALIZACJI] " + e.message, "error"));

// --- Obsługa zmiany motywu: #theme-btn ---
// Funkcja do ustawiania motywu oraz przechowująca wybór w localStorage
const THEME_KEY = "sys_auth_theme";
function applyTheme(theme) {
  // Ustaw atrybut theme na elemencie <html>
  document.documentElement.setAttribute("theme", theme);
  // Zachowaj wybór w localStorage
  localStorage.setItem(THEME_KEY, theme);
  // (Opcjonalnie: możesz tu dodać przełączanie klas motywu jeśli korzystasz z nich w CSS)
}

// Funkcja do aktualizacji ikony przycisku motywu
function updateThemeBtnIcon() {
  if (!DOM.themeBtn) return;
  DOM.themeBtn.innerHTML =
    document.documentElement.getAttribute("theme") === "dark"
      ? '<i class="fas fa-moon"></i>'
      : '<i class="fas fa-sun"></i>';
}

// Przycisk zmiany motywu (#theme-btn)
if (DOM.themeBtn) {
  DOM.themeBtn.addEventListener("click", function () {
    const isDark = document.documentElement.getAttribute("theme") === "dark";
    applyTheme(isDark ? "light" : "dark");
    updateThemeBtnIcon();
  });
}

// Ustaw motyw na podstawie localStorage lub domyślnie oraz uaktualnij ikonę
(function initTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") {
      applyTheme(saved);
    } else {
      applyTheme(document.documentElement.getAttribute("theme") || "dark");
    }
  } catch (e) {
    applyTheme("dark");
  }
  updateThemeBtnIcon();
})();

// Autostart: załaduj klucz API (auth.json XOR lub localStorage), potem credentials i lista wylogowań z GitHub
loadPat()
  .then(() => {
    initCredentials();
    refreshLogoutInfo();
  })
  .catch((e) => {
    updateLog("[BŁĄD] " + (e.message || e), "error");
  });

// Zablokuj możliwość cofania (przycisk Wstecz)
(function () {
  if (typeof history === "undefined" || !history.pushState) return;
  history.pushState(null, "", location.href);
  window.addEventListener("popstate", function () {
    history.pushState(null, "", location.href);
  });
})();
