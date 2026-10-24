# GitHub Sync для Obsidian

Плагин для Obsidian, который автоматически синхронизирует хранилище (vault) с репозиторием на GitHub при запуске Obsidian.

## Возможности

- Синхронизация при запуске Obsidian (можно отключить в настройках)
- Ручная синхронизация командой **GitHub Sync: Sync now** или кнопкой на боковой панели
- Настройки: токен GitHub, владелец и имя репозитория, ветка

> Статус: заготовка проекта, сама логика синхронизации ещё не реализована.

## Разработка

```bash
npm install
npm run dev     # сборка в режиме watch
npm run build   # проверка типов и production-сборка
```

Для локального тестирования скопируйте `main.js` и `manifest.json` в
`<vault>/.obsidian/plugins/github-sync/` и включите плагин в настройках Obsidian.

## Релиз

```bash
npm version patch   # обновит manifest.json и versions.json
```

К релизу на GitHub прикладываются файлы `main.js` и `manifest.json`.
