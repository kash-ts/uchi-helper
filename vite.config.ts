import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { execSync } from 'child_process';

let commitHash = '620e2e3';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  console.debug(e);
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0'),
    __BUILD_HASH__: JSON.stringify(commitHash),
  },
  build: {
    minify: true,
  },
  plugins: [
    monkey({
      entry: 'src/index.ts',
      userscript: {
        name: 'Uchi.ru AI Helper | Авто-решение и подсказки',
        namespace: 'https://github.com/kash-ts/uchi-helper',
        version: '1.0.0',
        description: 'Умный автоматический помощник для решения заданий, проверочных работ и тестов на портале Учи.ру (uchi.ru) с поддержкой нейросети GigaChat.',
        author: 'Kash',
        homepageURL: 'https://github.com/kash-ts/uchi-helper',
        supportURL: 'https://github.com/kash-ts/uchi-helper/issues',
        updateURL: 'https://raw.githubusercontent.com/kash-ts/uchi-helper/main/dist/uchiru.meta.js',
        downloadURL: 'https://raw.githubusercontent.com/kash-ts/uchi-helper/main/dist/uchiru.user.js',
        license: 'GPL-3.0',
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
        fileName: 'uchiru.user.js',
        metaFileName: true
      }
    })
  ]
});
