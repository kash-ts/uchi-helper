<div align="center">

**Автоматическое решение заданий на Учи.ру с помощью AI**

Помощник для платформы [Учи.ру](https://uchi.ru), который автоматически решает задания с использованием нейросети. Поддерживает **GigaChat** (бесплатный доступ) и любые **OpenAI-совместимые** провайдеры. Умеет задавать уточняющие вопросы через встроенный чат и полностью автоматически заполнять и отправлять ответы.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/kash-ts/uchi-helper/releases)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-compatible-orange.svg?logo=tampermonkey)](https://www.tampermonkey.net/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-MV3-yellow.svg?logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/)

</div>

---

## Установка

### Tampermonkey

1. Установи расширение [Tampermonkey](https://www.tampermonkey.net/) для своего браузера
2. Перейди по ссылке и нажми **«Установить»**:

   [![Установить](https://img.shields.io/badge/⬇%20Установить%20uchiru.user.js-4CAF50?style=for-the-badge)](https://raw.githubusercontent.com/kash-ts/uchi-helper/main/dist/uchiru.user.js)

3. Обновления применяются автоматически

### Chrome Extension (MV3)

1. Скачай репозиторий и собери: `npm run build:extension`
2. Открой `chrome://extensions/` → включи **«Режим разработчика»**
3. Нажми **«Загрузить распакованное расширение»** → выбери папку `dist-extension`

---

## AI-провайдеры

> ⚠️ Скрипт тестировался только с GigaChat. Работоспособность с иными провайдерами не гарантируется.

<details>
<summary><b>GigaChat</b></summary>

GigaChat — нейросеть от Сбера с бесплатным тарифом. Поддерживает текст и изображения.

**Как получить токен:**
1. Зарегистрируйся на [developers.sber.ru](https://developers.sber.ru/)
2. Создай проект и перейди в раздел **«Доступ к API»**
3. Скопируй **Authorization Data** (строка в формате Base64)

> 🔐 Все данные хранятся исключительно на вашем устройстве!

</details>

<details>
<summary><b>OpenAI-совместимые провайдеры</b></summary>

Любой провайдер, поддерживающий формат OpenAI API: OpenAI, OpenRouter, Mistral, локальный Ollama и другие.

**Что нужно:**
- URL эндпоинта (например `https://api.openai.com/v1`)
- API-ключ провайдера

> 🔐 Все данные хранятся исключительно на вашем устройстве!

</details>

---


## Настройка

1. Открой любое задание на Учи.ру
2. Нажми на иконку помощника → вкладка **«Настройки»**
3. Выбери провайдера AI и заполни необходимые данные → **«Сохранить»**

---

## Разработка

```bash
npm install              # зависимости
npm run dev              # dev-сервер Vite
npm run build            # сборка UserScript
npm run build:extension  # сборка Chrome Extension
npm run build:all        # полная сборка (tsc + userscript + extension)
npm run lint             # ESLint
npm run lint:fix         # ESLint с автоисправлением
```

**Артефакты сборки:**
- `dist/uchiru.user.js` — скрипт для Tampermonkey
- `dist/uchiru.meta.js` — мета-файл для проверки обновлений
- `dist-extension/` — расширение Chrome MV3

**Структура:**
```
src/
├── index.ts               # точка входа, маршрутизация по URL
├── interceptor/           # перехват fetch-запросов сессии
├── services/              # AI-клиент, промпты, retry-логика
├── ui/                    # виджет, чат, подсветка ответов
├── utils/                 # ввод в React-поля, drag-and-drop, парсинг
└── extension/             # фон Chrome Extension (service worker)
```

---

## Лицензия

[GPL-3.0](LICENSE) © Kash
