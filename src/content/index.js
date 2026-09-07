'use strict';

/**
 * Текстовое наполнение лендинга.
 *
 * Тексты написаны под семантическое ядро из docs/SEO.md. Компания принимает
 * лом ТОЛЬКО на своей площадке — вывоз, демонтаж и выездные работы намеренно
 * не упоминаются нигде.
 *
 * Правила тона, согласованные с заказчиком:
 *   1. Пишем от лица клиента, а не компании: не «мы осуществляем приём»,
 *      а «привозите и получаете деньги в тот же день».
 *   2. Говорим «цена» и «цены», а не «прайс». Слово «прайс-лист» оставлено
 *      только там, где оно отрабатывает поисковый запрос (см. views/price.ejs).
 *   3. Избегаем тире в предложениях: вместо него точка, запятая или двоеточие.
 *      Фраза должна читаться так, как человек сказал бы её вслух.
 *   4. Каждое утверждение проверяемо. Если факта нет, формулировка убирается,
 *      а не заменяется общими словами.
 *   5. Главное правило с сентября 2026 года: текста на главной должно быть
 *      столько, сколько человек прочитает не останавливаясь. Абзацы, шаги,
 *      FAQ и объяснения с неё убраны по просьбе заказчика: за ценой приходят,
 *      описания не читают. Одна строка на блок, дальше цифры и телефон.
 */

const site = require('../config/site');

/**
 * Первый экран: адрес, заголовок и оффер. Ленты фактов под ним больше нет,
 * формы на нём тоже: заявку принимает блок контактов внизу страницы.
 */
const hero = {
  eyebrow: 'Омск, 2-я Барнаульская, 105, микрорайон Новый Амур',
  title: 'Приём металлолома в Омске',
  offer: 'Взвесим при вас и рассчитаемся в тот же день'
};

/**
 * Полоса доверия под первым экраном. Только значок и строка: пояснения к ним
 * убраны вместе с остальными текстами главной.
 */
const trust = [
  { icon: 'scales', title: 'Взвешивание при вас' },
  { icon: 'ruble', title: 'Деньги в день сдачи' },
  { icon: 'search', title: 'Цена известна заранее' },
  { icon: 'shield', title: 'Работаем официально' }
];

/**
 * Крупные плитки «что принимаем»: название и цена, без описаний.
 * `anchor` ведёт на якорь категории в таблице цен, `photo` — файл из /img/photo.
 *
 * Верхняя цена стоит на всех пяти плитках. У первых трёх она приходит из
 * основного прайса через `priceFrom`, у радиолома и драгметаллов — из их
 * каталогов через `catalogFrom`. Там цена бывает и за грамм, и за штуку,
 * и за контакт, поэтому верхнюю считаем только по весовым позициям
 * (см. `catalogs.topPrice`) и показываем вместе с единицей.
 */
const tiles = [
  {
    id: 'cvetmet',
    name: 'Цветной лом',
    anchor: '/price#med',
    photo: 'cvetmet',
    priceFrom: { category: 'med', group: 'cvetmet' }
  },
  {
    id: 'chermet',
    name: 'Чёрный лом',
    anchor: '/price#stal-chugun',
    photo: 'chermet-alt',
    priceFrom: { category: 'stal-chugun', group: 'chermet' }
  },
  {
    id: 'redkozem',
    name: 'Редкоземельный лом',
    anchor: '/price#tverdye-splavy-pobedit',
    photo: 'redkozem',
    priceFrom: { category: 'tverdye-splavy-pobedit', group: 'redkozem' }
  },
  {
    id: 'radiolom',
    name: 'Радиолом',
    anchor: '/radiodetali',
    photo: 'radiolom',
    catalogFrom: 'radio',
    wide: true
  },
  {
    id: 'dragmet',
    name: 'Драгметаллы',
    anchor: '/dragmetally',
    photo: 'dragmet',
    catalogFrom: 'dragmet',
    wide: true
  }
];

/** Компактный список остальных позиций: для поиска и для редких запросов. */
const alsoAccepted = [
  { name: 'Аккумуляторы', anchor: '/price#akkumulyatory' },
  { name: 'Свинец', anchor: '/price#svinec' },
  { name: 'Никель и нихром', anchor: '/price#nihromy-i-nikelsoderzhaschie-splavy' },
  { name: 'Олово и припои', anchor: '/price#olovo' },
  { name: 'Твёрдые сплавы, победит', anchor: '/price#tverdye-splavy-pobedit' },
  { name: 'Титан', anchor: '/price#titan' },
  { name: 'Цинк и ЦАМ', anchor: '/price#cink-cam' },
  { name: 'Баббиты', anchor: '/price#babbity' },
  { name: 'Вольфрам и молибден', anchor: '/price#volfram-molibden-niobiy-volframosoderzhaschie-sp' },
  { name: 'Ферросплавы', anchor: '/price#ferrosplavy' },
  { name: 'Электродвигатели', anchor: '/price#elektrodvigateli' },
  { name: 'Латунь и бронза', anchor: '/price#latun-bronza' },
  { name: 'Быстрорежущая сталь', anchor: '/price#bystrorezhuschie-stali' }
];

/** Площадка: заголовок секции с картой. Условия приёма описаны на /price. */
const location = {
  title: 'Пункт приёма металлолома в Омске'
};

/**
 * Один блок «Документы»: слева реквизиты лицензий, справа сканы
 * благодарственных писем. Оба блока раньше жили отдельными секциями
 * с абзацами; заказчик попросил вернуть их вместе и без текста.
 *
 * Реквизиты берём из site.legal, чтобы номера не разъезжались с подвалом
 * и политикой обработки данных. Подписи к письмам взяты с самих писем:
 * ничего не додумываем, иначе получится реклама заслуг, которых
 * в документах нет.
 */
const documents = {
  title: 'Документы',
  rows: [
    {
      k: 'Лицензия на лом',
      v: `№ ${site.legal.license.number} от ${site.legal.license.dateText}`
    },
    {
      k: 'Лицензия на драгметаллы',
      v: `№ ${site.legal.licenseDragmet.number} от ${site.legal.licenseDragmet.dateText}`
    },
    { k: 'Наименование', v: site.legalName },
    { k: 'ОГРН и ИНН', v: `${site.legal.ogrn} · ${site.legal.inn}` }
  ],
  gratitude: [
    {
      slug: 'gratitude-byust',
      caption: 'ВООВ «Боевое братство»: реконструкция бюста Петра Ильичёва',
      alt: 'Благодарственное письмо Омского отделения ВООВ «Боевое братство» за помощь в реконструкции бюста Петра Ильичёва'
    },
    {
      slug: 'gratitude-football',
      caption: 'Кубок Победы: турнир по мини-футболу, Омск, 2023',
      alt: 'Благодарственное письмо за содействие в проведении межнационального турнира по мини-футболу «Кубок Победы», Омск, 2023'
    }
  ]
};

/**
 * Рейтинг 2ГИС. Отдельной секции у него больше нет: оценка стоит строкой
 * в панели под картой, рядом с адресом и кнопкой маршрута.
 */
const reviews = {
  score: 4.7,
  countLabel: '71 оценка в 2ГИС'
};

/**
 * Витрина цен на главной и список для калькулятора. Отбираем ходовые позиции
 * вручную: автоматический «топ по цене» выносит наверх редкие сплавы
 * (тантал, ВК-ТК), которые ищут единицы, и посетителю это бесполезно.
 */
const popular = [
  { id: 'lom-medi-blesk', label: 'Медь «Блеск»' },
  { id: 'lom-medi-miks', label: 'Медь (микс)' },
  { id: 'lom-nikelya-ni-100', label: 'Никель' },
  { id: 'lom-bronzy', label: 'Бронза' },
  { id: 'lom-latuni-kusok', label: 'Латунь (кусок)' },
  { id: 'lom-titana-vt-1-0', label: 'Титан ВТ-1-0' },
  { id: 'lom-alyuminiya-bytovogo', label: 'Алюминий бытовой' },
  { id: 'lom-svinca', label: 'Свинец (чушка)' },
  { id: 'lom-nerzhaveyuschey-stali-ni-9-5-11', label: 'Нержавейка (Ni >9,5–11 %)' },
  { id: 'akkumulyatory-polipropilenovye-ne-slitye', label: 'Аккумуляторы' }
];

/** Позиции в бегущей строке цен. Держим короткими: это витрина, не таблица. */
const ticker = [
  { id: 'lom-medi-blesk', label: 'Медь «Блеск»' },
  { id: 'lom-medi-miks', label: 'Медь микс' },
  { id: 'lom-latuni-kusok', label: 'Латунь' },
  { id: 'lom-bronzy', label: 'Бронза' },
  { id: 'lom-alyuminiya-bytovogo', label: 'Алюминий' },
  { id: 'lom-nerzhaveyuschey-stali-ni-9-5-11', label: 'Нержавейка' },
  { id: 'lom-svinca', label: 'Свинец' },
  { id: 'lom-nikelya-ni-100', label: 'Никель' },
  { id: 'akkumulyatory-polipropilenovye-ne-slitye', label: 'АКБ' },
  { id: 'lom-titana-vt-1-0', label: 'Титан' }
];

module.exports = {
  hero, trust, tiles, alsoAccepted, location, reviews, documents, popular, ticker
};
