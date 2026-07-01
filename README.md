# RealAdvisor

**Interní agregátor realitních inzerátů pro finanční poradce**

Centrální pracovní plocha pro vyhledávání, hodnocení a prezentaci nemovitostí klientům. Interní nástroj — neveřejný portál.

---

## Architektura projektu

```
RealAdvisor/
├── src/                          # Next.js 14 frontend (App Router)
│   ├── app/
│   │   ├── layout.tsx            # Root layout s ClerkProvider
│   │   ├── page.tsx              # Redirect → /sign-in nebo /dashboard
│   │   ├── sign-in/              # Clerk přihlašovací stránka
│   │   ├── sign-up/              # Clerk registrace s e-mail verifikací
│   │   └── dashboard/            # Chráněná oblast (vyžaduje auth + ověřený e-mail)
│   │       ├── layout.tsx        # Sidebar navigace
│   │       └── page.tsx          # Dashboard (sekce 4.1 specifikace)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui komponenty
│   │   └── dashboard/            # Dashboard widgety
│   │       ├── DashboardNav.tsx  # Sidebar navigace
│   │       ├── StatCard.tsx      # Statistická karta
│   │       ├── TopOpportunities.tsx  # Top 5 inzerátů s nejvyšším skóre
│   │       ├── PriceAlarms.tsx   # Cenové alarmy (pokles > 5 %)
│   │       ├── WatchlistSummary.tsx  # Přehled watchlistů klientů
│   │       └── QuickFilters.tsx  # Rychlé filtry
│   ├── lib/
│   │   ├── utils.ts              # shadcn/ui utility
│   │   └── dashboard-data.ts     # Datový layer dashboardu (připraven pro API)
│   └── middleware.ts             # Clerk auth guard pro /dashboard/*
│
├── backend/                      # NestJS API (Fáze 1+)
│   ├── src/
│   │   ├── main.ts              # Bootstrap + Swagger + Helmet
│   │   ├── app.module.ts        # Root modul (moduly se přidávají po fázích)
│   │   └── scoring/
│   │       └── scoring.service.ts  # Scoring engine (sekce 5 specifikace)
│   ├── prisma/
│   │   └── schema.prisma        # Kompletní DB schema (sekce 6 specifikace)
│   ├── docker-compose.yml       # PostgreSQL 16 + PostGIS + Redis 7
│   ├── .env.example             # Vzor proměnných prostředí
│   └── package.json             # NestJS závislosti
│
└── .env.local                   # Lokální proměnné (Clerk klíče atd.)
```

---

## Stack

| Vrstva | Technologie |
|--------|-------------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| Autentizace | Clerk (e-mail + heslo, SSO, e-mail verifikace) |
| Backend | NestJS (Node.js + TypeScript) |
| Databáze | PostgreSQL 16 + PostGIS |
| ORM | Prisma |
| Fronta | BullMQ + Redis 7 |
| Cache | Redis 7 |
| Mapy | Mapbox GL JS (nebo Mapy.cz API) |
| PDF | Puppeteer nebo @react-pdf/renderer |
| AI (Fáze 3) | Claude API nebo OpenAI GPT-4o |
| Deployment | Vercel (frontend) + Railway (backend) |

---

## Spuštění lokálně

### 1. Prerekvizity
- Node.js 20+
- Docker (pro PostgreSQL + Redis)

### 2. Frontend

```bash
# Naklonuj a nainstaluj závislosti
npm install

# Vyplň Clerk klíče v .env.local
# Získej je na https://clerk.com (zdarma do 10 000 MAU)
cp .env.local.example .env.local   # pak vyplň hodnoty

# Spusť vývojový server
npm run dev
```

Aplikace poběží na [http://localhost:3000](http://localhost:3000).

### 3. Backend (připraven pro Fázi 1)

```bash
cd backend

# Spusť PostgreSQL + Redis
docker-compose up -d

# Nainstaluj závislosti
npm install

# Nastav proměnné
cp .env.example .env    # pak vyplň hodnoty

# Spusť migrace
npm run db:generate
npm run db:migrate

# Spusť API server
npm run start:dev
```

API poběží na [http://localhost:3001/api/v1](http://localhost:3001/api/v1).  
Swagger dokumentace: [http://localhost:3001/api/docs](http://localhost:3001/api/docs).

---

## Compliance pravidla

**Zlaté pravidlo:** Nikdy neukládáme fotografie ani celé texty inzerátů.

Ukládáme pouze: název, cenu, cenu/m², dispozici, plochu, lokalitu, GPS, typ vlastnictví, štítky, datum, zdroj a URL originálu. Uživatel vždy vidí tlačítko **Otevřít originál**.

Každý konektor musí respektovat:
- `robots.txt` zdrojového portálu
- Rate limit: max 1 požadavek / 2 sekundy
- Cache: min 4 hodiny před opakovaným dotazem
- Smluvní základ nebo partnerství u komerčních portálů (Sreality, Bezrealitky)

---

## Roadmapa

| Fáze | Časový rámec | Cíl |
|------|-------------|-----|
| **Fáze 1** | 0–3 měsíce | Ruční MVP — auth, ruční import URL, search, watchlist, scoring, PDF |
| **Fáze 2** | 3–6 měsíců | Automatické konektory (Sreality, Bezrealitky), RÚIAN, Golemio, BullMQ |
| **Fáze 3** | 6–12 měsíců | AI scoring, LLM extrakce atributů, pokročilá analytika |
| **Fáze 4** | 12–18 měsíců | Klientský portál, interaktivní PDF, mobilní PWA |

---

## Databázové schéma

Kompletní schéma viz [`backend/prisma/schema.prisma`](./backend/prisma/schema.prisma).

Klíčové tabulky:
- `listings` — normalizovaná data nemovitostí (bez fotek, bez celého textu)
- `listing_scores` — skóre a sub-skóre (0–100) dle 5-dimenzionálního modelu
- `listing_snapshots` — historie cen pro detekci poklesů
- `watchlists` — pipeline stavů (nový → posláno → zájem → prohlídka → zamítnuto)
- `advisor_notes` — interní poznámky poradce (viditelné pouze přihlášenému uživateli)

---

## Scoring model

Každý inzerát dostane skóre 0–100 jako vážený průměr 5 dimenzí minus penalizace:

| Dimenze | Váha |
|---------|------|
| Cena vs. medián lokality | 30 % |
| Lokalita (MHD, POI, rozvoj) | 25 % |
| Hypoteční vhodnost (OV, stav, energie) | 20 % |
| Růstový potenciál | 15 % |
| Likvidita | 10 % |

Implementace scoring algoritmu: [`backend/src/scoring/scoring.service.ts`](./backend/src/scoring/scoring.service.ts).

---

*RealAdvisor v1.0 — Interní dokument. Neveřejné.*
