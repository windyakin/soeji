export default {
  sourceDir: './',
  artifactsDir: './dist',
  ignoreFiles: [
    'node_modules',
    'web-ext-config.mjs',
    'package.json',
    'package-lock.json',
    '*.md',
    '.git',
    '.gitignore',
    'dist'
  ],
  build: {
    overwriteDest: true
  },
  run: {
    startUrl: ['https://novelai.net/'],
    browserConsole: true
  }
};
