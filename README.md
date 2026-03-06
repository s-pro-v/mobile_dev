# 2FA — SYS.AUTH

Aplikacja logowania 2FA z zatwierdzaniem PUSH, panelem admina i terminalem mobilnym (grafik obsady). Wszystko w jednym folderze, bez zewnętrznego backendu — stan i uprawnienia w plikach JSON w repozytorium GitHub.

---

## Struktura (całość)

```
2fa/
├── index.html          ← punkt wejścia (wybór: Logowanie / Admin / Mobile)
├── logowanie.html      ← logowanie 2FA, żądanie PUSH, wylogowanie
├── admin.html          ← panel admina: zatwierdzanie, wylogowania, lista zalogowanych
├── mobile/
│   ├── index.html      ← terminal mobilny (grafik zmiany)
│   ├── index.js
│   └── index.css
└── README.md           ← ten plik
```

---

## Uruchomienie

1. Otwórz **index.html** w przeglądarce (lub serwuj folder lokalnie).
2. **Logowanie** — wejście do systemu (2FA / PUSH / bez potwierdzenia).
3. **Panel admina** — zatwierdzanie żądań, wylogowanie użytkowników, lista osób zalogowanych.
4. **Terminal mobilny** — po zalogowaniu: grafik, szczegóły; w nagłówku wyświetlana jest zalogowana osoba (3 pierwsze litery).

Wspólny stan: `dev/sys_state.json` (oraz credentials w `dev/`). Szczegóły w **dev/README.md**.

---

## Przepływ

- Użytkownik loguje się na **logowanie.html** → po zatwierdzeniu (lub „bez potwierdzenia”) może wejść na **mobile**.
- **Admin** widzi zalogowanych i oczekujących, może wylogować lub zmienić uprawnienia.
- Wylogowanie z **mobile** lub **logowanie** aktualizuje stan w repozytorium.

Folder **2FA** stanowi jedną całość: wejście przez **index.html**, reszta to strony tej samej aplikacji.
