# Gods Robot Killer (v313)

Браузерный 2D-экшен / платформер.

## Играть онлайн

- **Главная игра:** https://aipush.dev/gods-robot-killer/
- **Редактор уровней:** https://aipush.dev/gods-robot-killer/editor.html

---

## Как это устроено (структура файлов)

Веб-сервер и GitHub Pages по умолчанию всегда ищут и открывают файл `index.html`:

1. **Главная игра:** лежит в `index.html` — открывается прямо по ссылке `https://aipush.dev/gods-robot-killer/`.
2. **Любые другие страницы:** открываются прямым указанием имени файла в адресной строке:
   - `editor.html` → `https://aipush.dev/gods-robot-killer/editor.html`
   - Любой новый файл `test.html` → `https://aipush.dev/gods-robot-killer/test.html`
3. **Разделение по подпапкам (режимы / версии / уровни):**
   - Если положить файл в папку, например `demo/index.html` — он откроется по адресу `https://aipush.dev/gods-robot-killer/demo/`.
   - Если переименовать файл в `index.html`, он автоматически станет главной страницей.

