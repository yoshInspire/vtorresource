'use strict';

const site = require('../config/site');

const abs = pathname => site.url + (pathname.startsWith('/') ? pathname : `/${pathname}`);

/** Организация / точка приёма — общий узел для всех страниц. */
function organization() {
  const node = {
    '@type': ['LocalBusiness', 'RecyclingCenter'],
    '@id': `${site.url}/#organization`,
    name: `${site.brand} — ${site.tagline} ${site.cityIn}`,
    alternateName: site.brand,
    url: site.url,
    description: site.seo.defaultDescription,
    telephone: site.phones.map(p => p.raw),
    email: site.email,
    priceRange: '₽₽',
    currenciesAccepted: 'RUB',
    paymentAccepted: 'Перевод на банковскую карту, безналичный расчёт для организаций',
    areaServed: [
      { '@type': 'City', name: site.city },
      { '@type': 'AdministrativeArea', name: site.region }
    ],
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      addressRegion: site.address.region,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country
    },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '08:00',
      closes: '20:00'
    }]
  };
  if (site.geo) {
    node.geo = { '@type': 'GeoCoordinates', latitude: site.geo.lat, longitude: site.geo.lon };
  }
  return node;
}

function webSite() {
  return {
    '@type': 'WebSite',
    '@id': `${site.url}/#website`,
    url: site.url,
    name: site.brand,
    inLanguage: 'ru-RU',
    publisher: { '@id': `${site.url}/#organization` }
  };
}

function webPage({ path: pathname, title, description }) {
  return {
    '@type': 'WebPage',
    '@id': `${abs(pathname)}#webpage`,
    url: abs(pathname),
    name: title,
    description,
    isPartOf: { '@id': `${site.url}/#website` },
    about: { '@id': `${site.url}/#organization` },
    inLanguage: 'ru-RU'
  };
}

function breadcrumbs(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: abs(t.path)
    }))
  };
}

function faqPage(items) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };
}

/** Каталог предложений по прайсу — для страницы цен. */
function offerCatalog(groups) {
  return {
    '@type': 'OfferCatalog',
    '@id': `${site.url}/price/#catalog`,
    name: `Цены на приём лома металлов ${site.cityIn}`,
    itemListElement: groups.map((group, gi) => ({
      '@type': 'OfferCatalog',
      position: gi + 1,
      name: group.title,
      description: group.description,
      itemListElement: group.categories.flatMap(category =>
        category.items
          .filter(item => item.cash !== null)
          .map(item => ({
            '@type': 'Offer',
            name: `${item.title}${item.note ? ` (${item.note})` : ''}`,
            category: category.name,
            price: item.cash,
            priceCurrency: 'RUB',
            eligibleQuantity: {
              '@type': 'QuantitativeValue',
              unitText: group.unitShort === 'т' ? 'тонна' : 'килограмм'
            },
            availableAtOrFrom: { '@id': `${site.url}/#organization` }
          }))
      )
    }))
  };
}

function graph(nodes) {
  return { '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) };
}

module.exports = { organization, webSite, webPage, breadcrumbs, faqPage, offerCatalog, graph, abs };
