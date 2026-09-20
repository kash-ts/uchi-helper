import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  build: {
    minify: true,
  },
  plugins: [
    monkey({
      entry: 'src/index.ts',
      userscript: {
        name: 'Uchi.ru AI Helper | Авто-решение и подсказки',
        namespace: 'https://github.com/uchi-helper',
        version: '1.0.0',
        description: 'Умный автоматический помощник для решения заданий, проверочных работ и тестов на портале Учи.ру (uchi.ru) с поддержкой нейросети GigaChat.',
        author: 'Kash',
        license: 'MIT',
        icon: 'https://assets.uchi.ru/favicons/favicon-32x32.png',
        match: [
          '*://uchi.ru/*',
          '*://*.uchi.ru/*'
        ],
        connect: [
          'ngw.devices.sberbank.ru',
          'gigachat.devices.sberbank.ru'
        ],
        'run-at': 'document-start',
        grant: [
          'unsafeWindow',
          'GM_getValue',
          'GM_setValue',
          'GM_xmlhttpRequest',
          'GM_registerMenuCommand'
        ]
      },
      build: {
        fileName: 'uchiru.user.js'
      }
    })
  ]
});
