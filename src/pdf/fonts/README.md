# Шрифты для PDF-прайса

Шрифты, которыми `src/lib/price-pdf.js` набирает `/price.pdf`, `/radiodetali.pdf`
и `/dragmetally.pdf`. Это те же Golos Text и Oswald, что на сайте, но в ttf:
woff2 из `public/fonts` pdfkit не читает, а ttf из `scripts/fonts` обрезаны
под обложку (93 знака) и для прайса не годятся.

| Файл | Начертание |
|---|---|
| `GolosText-Regular.ttf` | Golos Text 400 — строки прайса |
| `GolosText-SemiBold.ttf` | Golos Text 600 — цены, телефоны |
| `Oswald-SemiBold.ttf` | Oswald 600 — название и заголовки разделов |

Набор знаков: латиница, кириллица с «ё», типографские кавычки и тире, «№» и «₽».
Если в прайсе появится знак вне набора, в PDF на его месте будет пустой
прямоугольник: тогда шрифты нужно пересобрать с расширенным списком.

Оба шрифта под SIL Open Font License 1.1, тексты лицензий рядом.

## Как пересобрать

Исходники — переменные шрифты из репозитория Google Fonts:
`ofl/golostext/GolosText[wght].ttf` и `ofl/oswald/Oswald[wght].ttf`.

```python
# pip install fonttools
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

UNI = "U+0020-007E,U+00A0-00FF,U+0401,U+0410-044F,U+0451,U+2010-2027,U+2030-203A,U+2116,U+20BD,U+2212,U+00D7"
for src, wght, out in [("GolosText[wght].ttf", 400, "GolosText-Regular.ttf"),
                       ("GolosText[wght].ttf", 600, "GolosText-SemiBold.ttf"),
                       ("Oswald[wght].ttf", 600, "Oswald-SemiBold.ttf")]:
    font = instancer.instantiateVariableFont(TTFont(src), {"wght": wght})
    opts = subset.Options(); opts.layout_features = ["kern", "liga"]; opts.name_IDs = ["*"]
    s = subset.Subsetter(opts); s.populate(unicodes=subset.parse_unicodes(UNI)); s.subset(font)
    font.save(out)
```
