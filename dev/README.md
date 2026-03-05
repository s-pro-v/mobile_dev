# Pliki stanu (dev)

Wszystkie trzy aplikacje (**logowanie.html**, **admin.html**, **mobile**) korzystają z tego samego repozytorium GitHub i plików w `dev/`.

---

## Integracja: mobile ↔ admin ↔ logowanie

| Aplikacja     | Plik            | Odczyt/zapis                 | Opis                                                                                                          |
| ------------- | --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **logowanie** | logowanie.html  | state_file, credentials_file | Logowanie 2FA, żądanie PUSH, logowanie bez potwierdzenia, wylogowanie (Przerwij).                             |
| **admin**     | admin.html      | state_file, credentials_file | Zatwierdzanie/odrzucanie żądań, wylogowanie użytkowników, lista zalogowanych, ustawienia „Bez potwierdzenia”. |
| **mobile**    | mobile/index.js | state_file (raw + API)       | Weryfikacja sesji (active_sessions), wylogowanie z zapisem do state_file (gdy jest token).                    |

**Przepływ:** Użytkownik loguje się na **logowanie** → po zatwierdzeniu (lub przy „bez potwierdzenia”) trafia na **mobile**. **Admin** widzi zalogowanych i oczekujących, może wylogować lub zmienić uprawnienia. Wylogowanie z **mobile** lub **logowanie** aktualizuje **sys_state.json**; admin przy odświeżeniu widzi zmiany.

**Wspólna konfiguracja:** Ścieżki `state_file` i `credentials_file` muszą być takie same w logowanie i admin (np. `dev/sys_state.json`, `dev/key_f2a.json`). Przykład: `app_config.example.json`.

---

## sys_state.json

Plik stanu 2FA używany przez **logowanie.html**, **admin.html** i **mobile** (weryfikacja sesji, wylogowanie).

**Przykład struktury:** `sys_state.example.json` – skopiuj jako `sys_state.json` i uzupełnij.

### Pola

| Pole                 | Typ              | Opis                                                                                                                               |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `active_sessions`    | obiekt           | Zalogowani użytkownicy. Klucz = login (małe litery), wartość = `{ "original_name": "Imię Nazwisko", "last_active": timestamp_ms }` |
| `pending_2fa`        | obiekt           | Osoby czekające na zatwierdzenie przez admina. Klucz = login, wartość = `{ "time": timestamp_ms }`                                 |
| `access_permissions` | obiekt           | Tymczasowe decyzje admina: `"GRANTED"` / `"DENIED"` (po finalizacji sesji wpis jest usuwany)                                       |
| `audit_log`          | tablica stringów | Ostatnie zdarzenia (logowanie, wylogowanie, decyzje admina). Max ~100 wpisów, najnowsze na początku                                |

### Typy wpisów w audit_log

- **AUTH_SUCCESS: Zalogowano węzeł (PUSH AUTO) ->** – logowanie po zatwierdzeniu przez admina
- **AUTH_SUCCESS: Zalogowano (bez potwierdzenia) ->** – logowanie bez zatwierdzenia (użytkownik ma shifts[3]=TRUE)
- **USER_LOGOUT: … wylogował się.** – wylogowanie ze strony logowania (Przerwij)
- **USER_LOGOUT: … wylogował się (mobile).** – wylogowanie z panelu mobilnego
- **ADMIN_ACTION: ZATWIERDZONO / ODRZUCONO / Wylogowano** – akcje admina

### Przykład (fragment)

```json
{
  "active_sessions": {
    "jan.kowalski": {
      "original_name": "Jan Kowalski",
      "last_active": 1709560800000
    }
  },
  "pending_2fa": {},
  "access_permissions": {},
  "audit_log": [
    "[04.03.2025, 12:00:00] AUTH_SUCCESS: Zalogowano węzeł (PUSH AUTO) -> Jan Kowalski",
    "[04.03.2025, 11:58:00] AUTH_SUCCESS: Zalogowano (bez potwierdzenia) -> Roberts",
    "[04.03.2025, 11:45:00] USER_LOGOUT: Jan Kowalski wylogował się (mobile).",
    "[04.03.2025, 11:40:00] USER_LOGOUT: Anna Nowak wylogował się."
  ]
}
```

---

## auth.json (klucz API – XOR)

**logowanie.html** i **admin.html** pobierają token GitHub z pliku `dev/auth.json` w repozytorium `s-pro-v/json-lista`. Wartość `sys_pat` to token zaszyfrowany XOR z kluczem **w5g**, potem zakodowany base64.

Aby wygenerować `sys_pat`: otwórz w przeglądarce **encrypt_pat.html** (w głównym folderze 2FA), wklej swój PAT, kliknij „Zaszyfruj” i skopiowany wynik wklej do `auth.json`:

```json
[{ "sys_pat": "WYNIK_Z_ENCRYPT_PAT" }]
```

Klucz XOR w kodzie: `const XOR_KEY = 'w5g'` (logowanie.html, admin.html).

---

## app_config.example.json

Przykład wspólnej konfiguracji: `repo_owner`, `repo_name`, `state_file`, `credentials_file`. Skopiuj jako `app_config.json` w repozytorium i upewnij się, że **logowanie** i **admin** używają tych samych wartości (stałe w kodzie lub odczyt z pliku).
