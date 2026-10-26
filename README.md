# Gods Robot Killer (v313)

Браузерный 2D-экшен / платформер.

## Как играть онлайн (GitHub Pages)

Игра доступна по ссылке:
**https://akipushdev.github.io/gods-robot-killer/**

Редактор уровней:
**https://akipushdev.github.io/gods-robot-killer/editor.html**

---

## Деплой на VPS (Portainer / Docker)

### Вариант 1: Через Docker Compose
```bash
docker compose up -d
```
Игра будет доступна на `http://localhost:8765` (или `http://<IP_СЕРВЕРА>:8765`).

### Вариант 2: Через Portainer
1. Создать новый Stack из этого Git-репозитория.
2. Включить **Automatic updates** (Webhook) — при каждом `git push` игра обновится автоматически.

---

## Локальный запуск на компьютере

- **macOS:** Дважды щёлкните `Запустить игру (Mac).command` (при первом запуске: правый клик -> Открыть).
- **Windows:** Дважды щёлкните `Запустить игру (Windows).bat`.
