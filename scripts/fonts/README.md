# Шрифты для сборки картинок

Здесь лежат ttf-версии тех же шрифтов, которыми набран сайт: Oswald на
заголовки и Golos Text на текст. Нужны только `scripts/build-brand.js` —
librsvg подбирает шрифты через fontconfig, а woff2 из `public/fonts`
он не читает.

Файлы обрезаны до знаков, которые встречаются на обложке: кириллица, цифры
и немного пунктуации, 93 глифа. Отсюда и размер в 12–16 КБ.

Оба шрифта под SIL Open Font License 1.1, тексты лицензий рядом.

## Как пересобрать

```bash
pip install fonttools brotli
node scripts/build-brand.js --fonts   # печатает готовый скрипт для python
```

Исходники — переменные шрифты из репозитория Google Fonts:
`ofl/oswald/Oswald[wght].ttf` и `ofl/golostext/GolosText[wght].ttf`.
Начертание фиксируется через `fontTools.varLib.instancer` (Oswald на 600,
Golos на 400), затем `fontTools.subset` оставляет нужные знаки. Семейство
переименовано в «Oswald SemiBold» и «Golos Text Site»: иначе в fontconfig
оказались бы два начертания с одним именем и он выбрал бы любое.
