export const FEEDS = [
  {
    url: "https://www.sec.gov/news/pressreleases.rss",
    source: "SEC",
    tier: "Official",
    category: "companies"
  },
  {
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
    source: "Federal Reserve",
    tier: "Official",
    category: "economy"
  },
  {
    url: "https://www.bls.gov/feed/bls_latest.rss",
    source: "BLS",
    tier: "Official",
    category: "economy"
  },
  {
    url: "https://www.consumerfinance.gov/about-us/blog/feed/",
    source: "CFPB",
    tier: "Official",
    category: "personal-finance"
  },
  {
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    source: "CNBC",
    tier: "Established media",
    category: "markets"
  },
  {
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    source: "CoinDesk",
    tier: "Crypto media",
    category: "crypto"
  }
];

export const CATEGORIES = ["all", "markets", "companies", "economy", "personal-finance", "crypto"];

export const DEMO_STORIES = [
  {
    id: "demo-fed",
    title: "Federal Reserve officials emphasize data-dependent policy decisions",
    summary: "Federal Reserve updates remain closely watched by markets because interest-rate expectations affect borrowing costs, company valuations, and household finances. Open the source for the latest official release.",
    url: "https://www.federalreserve.gov/newsevents/pressreleases.htm",
    source: "Federal Reserve",
    source_tier: "Official",
    category: "economy",
    published_at: "2026-06-02T07:30:00.000Z"
  },
  {
    id: "demo-sec",
    title: "SEC newsroom tracks regulatory updates affecting investors and companies",
    summary: "The SEC publishes enforcement, disclosure, and market-structure announcements. These updates can matter for listed companies, funds, and individual investors.",
    url: "https://www.sec.gov/newsroom",
    source: "SEC",
    source_tier: "Official",
    category: "companies",
    published_at: "2026-06-02T07:15:00.000Z"
  },
  {
    id: "demo-bls",
    title: "Inflation and employment releases remain key signals for household budgets",
    summary: "BLS data helps explain changes in prices, wages, and employment. The digest highlights new releases and links directly to the underlying official data.",
    url: "https://www.bls.gov/newsroom/",
    source: "BLS",
    source_tier: "Official",
    category: "personal-finance",
    published_at: "2026-06-02T07:00:00.000Z"
  },
  {
    id: "demo-markets",
    title: "Market briefings surface the stories most likely to shape the trading day",
    summary: "The markets feed groups short updates from established publishers with official releases where possible, making it easier to scan developments before opening a full article.",
    url: "https://www.cnbc.com/markets/",
    source: "CNBC",
    source_tier: "Established media",
    category: "markets",
    published_at: "2026-06-02T06:45:00.000Z"
  },
  {
    id: "demo-crypto",
    title: "Crypto coverage is separated from official market and regulatory reporting",
    summary: "Crypto stories are clearly labelled so readers can distinguish specialist reporting from official sources. Important claims should be checked against primary sources.",
    url: "https://www.coindesk.com/",
    source: "CoinDesk",
    source_tier: "Crypto media",
    category: "crypto",
    published_at: "2026-06-02T06:30:00.000Z"
  }
];
