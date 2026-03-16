# Digisensus.ai Email Sending API

**Self-hosted transactional email infrastructure. Turn a $5/mo VPS into a full-featured email sending platform.**

Stop paying $20-100+/month for Mailgun, SendGrid, Postmark, or Amazon SES. Digisensus.ai Email Sending API gives you the same core features — DKIM signing, delivery tracking, suppression lists, IP warmup — running on your own server for the cost of a cheap VPS.

| Service | 10k emails/mo | 100k emails/mo |
|---------|--------------|----------------|
| Mailgun | $35/mo | $90/mo |
| SendGrid | $19.95/mo | $89.95/mo |
| Postmark | $15/mo | $85/mo |
| Amazon SES | $1/mo + setup | $10/mo + setup |
| **Digisensus.ai Email API** | **$5/mo VPS** | **$5/mo VPS** |

## Features

- **REST API** — Simple JSON API to send transactional emails
- **DKIM Signing** — Automatic RSA-2048 key generation and message signing
- **DNS Verification** — SPF, DKIM, DMARC record generation and live verification
- **Delivery Tracking** — Real-time events: accepted, delivered, bounced, failed, opened, clicked
- **Suppression Lists** — Automatic bounce/complaint/unsubscribe management
- **IP Warmup** — 30-day warmup schedule from 50 to 300k+ emails/day
- **IP Pool Management** — Multiple sending IPs with reputation tracking
- **Async Processing** — BullMQ job queue with retry and exponential backoff
- **Admin Dashboard** — Server-rendered UI to manage everything from a browser
- **API Key Auth** — Scoped keys with per-domain permissions
- **Docker Ready** — Single `docker compose up` deploys the full stack

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Your App  │────>│  Email API  │────>│   Postfix    │───> Internet
│             │ API │  (Fastify)  │SMTP │   (MTA)      │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
               ┌────┴────┐  ┌────┴────┐
               │ Postgres │  │  Redis  │
               │  (data)  │  │ (queue) │
               └──────────┘  └────┬────┘
                                  │
                           ┌──────┴──────┐
                           │   Worker    │
                           │ (BullMQ)    │
                           └─────────────┘
```

**Stack:** Fastify 5 · TypeScript · Drizzle ORM · PostgreSQL · Redis · BullMQ · Postfix · EJS

## Quick Start

### Prerequisites

- Docker and Docker Compose
- A VPS with port 25 open (for outbound SMTP)
- A domain with DNS access

### 1. Clone and Configure

```bash
git clone https://github.com/your-org/email-api.git
cd email-api
cp .env.example .env
```

Edit `.env` with your values:

```env
# PostgreSQL
POSTGRES_USER=emailapi
POSTGRES_PASSWORD=your-secure-db-password
POSTGRES_DB=emailapi
DATABASE_URL=postgres://emailapi:your-secure-db-password@email-postgres:5432/emailapi

# Redis
REDIS_URL=redis://email-redis:6379

# SMTP
SMTP_HOST=email-postfix
SMTP_PORT=25

# API
API_URL=https://api.yourdomain.com
MASTER_API_KEY=your-master-api-key-here

# Admin UI
ADMIN_PASSWORD=your-admin-password
SESSION_SECRET=generate-a-random-string-at-least-32-characters
```

### 2. Start the Stack

```bash
docker compose up -d
```

This starts 7 services:

| Service | Description | Port |
|---------|-------------|------|
| `email-postgres` | PostgreSQL 16 database | 5432 |
| `email-redis` | Redis 7 job queue | 6379 |
| `email-unbound` | Recursive DNS resolver | 53 |
| `email-spamassassin` | Spam scoring service | 783 |
| `email-postfix` | Postfix MTA (mail relay) | 25 |
| `email-api` | REST API + Admin UI | 3000 |
| `email-worker` | Background email sender | — |

If `email-api` fails with `password authentication failed for user "emailapi"` on first boot, the most common cause is an existing `./data/postgres` directory initialized with older credentials. Reset the local database volume and rebuild:

```bash
docker compose down
rm -rf data/postgres
docker compose up --build -d
```

### 3. Run Migrations and Seed

```bash
docker compose exec email-api npx drizzle-kit migrate
docker compose exec email-api node dist/db/seed.js
```

### 4. Add Your Domain

```bash
curl -X POST http://localhost:3000/v1/domains \
  -H "Authorization: Bearer YOUR_MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "yourdomain.com"}'
```

The response includes DNS records you need to add:

```json
{
  "domain": {
    "id": "...",
    "name": "yourdomain.com",
    "spfVerified": false,
    "dkimVerified": false,
    "dmarcVerified": false
  },
  "dnsRecords": [
    { "type": "TXT", "name": "yourdomain.com", "value": "v=spf1 include:_spf.yourdomain.com ~all" },
    { "type": "TXT", "name": "mail._domainkey.yourdomain.com", "value": "v=DKIM1; k=rsa; p=MIIBIjAN..." },
    { "type": "TXT", "name": "_dmarc.yourdomain.com", "value": "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com" }
  ]
}
```

### 5. Add DNS Records

Add the SPF, DKIM, and DMARC records to your DNS provider. Then verify:

```bash
curl -X PUT http://localhost:3000/v1/domains/yourdomain.com/verify \
  -H "Authorization: Bearer YOUR_MASTER_API_KEY"
```

### 6. Send Your First Email

```bash
curl -X POST http://localhost:3000/v1/yourdomain.com/messages \
  -H "Authorization: Bearer YOUR_MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "hello@yourdomain.com",
    "to": "recipient@example.com",
    "subject": "Hello from Email API",
    "html": "<h1>It works!</h1><p>Sent from my own email infrastructure.</p>"
  }'
```

Response:

```json
{
  "message": "Queued. Thank you.",
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Admin Dashboard

Access the admin UI at `http://localhost:3000/admin`. Log in with your `ADMIN_PASSWORD`.

The dashboard provides:

- **Overview** — Domain count, message stats, delivery rates, recent events
- **Domains** — Add domains, view DNS records, trigger verification
- **API Keys** — Create scoped keys, activate/deactivate, revoke
- **Messages** — Browse all sent messages with status filters, view message detail and event timeline
- **Events** — Filterable event log across all messages
- **Suppressions** — Manage bounce/unsubscribe/complaint lists per domain
- **IP Pools** — Manage sending IPs, monitor warmup stage, daily limits, and reputation scores

## API Reference

All API endpoints require authentication via the `Authorization` header:

```
Authorization: Bearer YOUR_API_KEY
```

Or HTTP Basic:

```
Authorization: Basic base64(api:YOUR_API_KEY)
```

### Health

#### `GET /health`

No authentication required.

```json
{
  "status": "healthy",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

---

### Domains

#### `POST /v1/domains`

Add a sending domain. Generates DKIM key pair automatically.

```json
// Request
{ "name": "example.com" }

// Response 201
{
  "domain": {
    "id": "uuid",
    "name": "example.com",
    "spfVerified": false,
    "dkimVerified": false,
    "dmarcVerified": false,
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "dnsRecords": [
    { "type": "TXT", "name": "example.com", "value": "v=spf1 ..." },
    { "type": "TXT", "name": "mail._domainkey.example.com", "value": "v=DKIM1; ..." },
    { "type": "TXT", "name": "_dmarc.example.com", "value": "v=DMARC1; ..." }
  ]
}
```

#### `GET /v1/domains`

List all domains.

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "example.com",
      "spfVerified": true,
      "dkimVerified": true,
      "dmarcVerified": true,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `GET /v1/domains/:domain`

Get domain details.

#### `GET /v1/domains/:domain/dns`

Get the required DNS records for a domain.

```json
{
  "dnsRecords": [
    { "type": "TXT", "name": "example.com", "value": "v=spf1 include:_spf.example.com ~all" },
    { "type": "TXT", "name": "mail._domainkey.example.com", "value": "v=DKIM1; k=rsa; p=..." },
    { "type": "TXT", "name": "_dmarc.example.com", "value": "v=DMARC1; p=quarantine; ..." }
  ]
}
```

#### `PUT /v1/domains/:domain/verify`

Check live DNS records and update verification status.

```json
{
  "domain": "example.com",
  "verification": {
    "spf": true,
    "dkim": true,
    "dmarc": false
  }
}
```

#### `DELETE /v1/domains/:domain`

Delete a domain and all associated data. Returns `204`.

---

### Messages

#### `POST /v1/:domain/messages`

Send a transactional email. The message is queued and processed asynchronously.

```json
// Request
{
  "from": "noreply@example.com",
  "to": "user@recipient.com",
  "subject": "Your order confirmation",
  "html": "<h1>Order #1234</h1><p>Thank you for your purchase.</p>",
  "text": "Order #1234 - Thank you for your purchase."
}

// Response 202
{
  "message": "Queued. Thank you.",
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

The `to` field accepts a single address or an array of addresses.

Messages are automatically DKIM-signed using the domain's key pair.

#### `GET /v1/:domain/messages/:id`

Get message status.

```json
{
  "id": "uuid",
  "from": "noreply@example.com",
  "to": "user@recipient.com",
  "subject": "Your order confirmation",
  "status": "delivered",
  "messageIdHeader": "<hex@example.com>",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:01.000Z"
}
```

Message status values: `queued` | `sending` | `delivered` | `bounced` | `failed` | `rejected`

---

### Events

#### `GET /v1/:domain/events`

Query delivery events with filtering and cursor-based pagination.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by event type |
| `recipient` | string | Filter by recipient email |
| `begin` | ISO date | Events after this date (inclusive) |
| `end` | ISO date | Events before this date (inclusive) |
| `limit` | number | Max results, 1-300 (default 100) |
| `cursor` | ISO date | Pagination cursor from previous response |

```json
{
  "items": [
    {
      "id": "uuid",
      "messageId": "uuid",
      "type": "delivered",
      "severity": "info",
      "recipient": "user@recipient.com",
      "details": { "response": "250 OK" },
      "createdAt": "2026-01-01T00:00:01.000Z"
    }
  ],
  "paging": {
    "next": "2026-01-01T00:00:01.000Z"
  }
}
```

Event types: `accepted` | `delivered` | `bounced` | `failed` | `opened` | `clicked` | `complained` | `unsubscribed`

---

### API Keys

#### `POST /v1/keys`

Create an API key. The full key is only returned once.

```json
// Request
{
  "name": "Production App",
  "domainId": "uuid",        // optional — scope to a domain
  "permissions": ["send"]    // optional
}

// Response 201
{
  "id": "uuid",
  "key": "key-a1b2c3d4e5f6...",
  "keyPrefix": "key-a1b2",
  "name": "Production App",
  "domainId": "uuid",
  "permissions": ["send"],
  "active": true,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

#### `GET /v1/keys`

List all API keys (prefix only, never the full key).

#### `PATCH /v1/keys/:id`

Update name, permissions, or active status.

```json
{ "active": false }
```

#### `DELETE /v1/keys/:id`

Permanently revoke an API key. Returns `204`.

---

### Suppressions

Manage per-domain suppression lists. Suppressed recipients are automatically blocked from receiving emails.

Types: `bounces` | `unsubscribes` | `complaints`

#### `GET /v1/:domain/suppressions/:type`

```json
{
  "items": [
    {
      "id": "uuid",
      "domainId": "uuid",
      "email": "bounced@example.com",
      "reason": "bounce",
      "details": "550 User unknown",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `POST /v1/:domain/suppressions/:type`

```json
// Request
{
  "email": "user@example.com",
  "details": "Manual suppression"
}

// Response 201
{ "message": "Suppression added" }
```

#### `DELETE /v1/:domain/suppressions/:type?email=user@example.com`

Remove a suppression. Returns `204`.

---

## IP Warmup

New IP addresses start with a conservative sending limit that gradually increases over 30 days:

| Day | Daily Limit | Day | Daily Limit |
|-----|-------------|-----|-------------|
| 1 | 50 | 16 | 7,000 |
| 2 | 75 | 17 | 10,000 |
| 3 | 100 | 18 | 15,000 |
| 4 | 150 | 19 | 20,000 |
| 5 | 200 | 20 | 30,000 |
| 6 | 300 | 21 | 40,000 |
| 7 | 400 | 22 | 50,000 |
| 8 | 500 | 23 | 65,000 |
| 9 | 700 | 24 | 80,000 |
| 10 | 1,000 | 25 | 100,000 |
| 11 | 1,500 | 26 | 130,000 |
| 12 | 2,000 | 27 | 170,000 |
| 13 | 3,000 | 28 | 220,000 |
| 14 | 4,000 | 29 | 300,000 |
| 15 | 5,000 | 30 | Unlimited |

This protects your IP reputation and maximizes deliverability from day one.

## Development

### Local Setup

```bash
# Install dependencies
npm install

# Start Postgres and Redis (if not using Docker)
docker compose up email-postgres email-redis email-postfix -d

# Update .env with localhost addresses
# DATABASE_URL=postgres://emailapi:emailapi@localhost:5432/emailapi
# REDIS_URL=redis://localhost:6379

# Run migrations
npm run db:migrate

# Seed warmup schedules
npm run db:seed

# Start API (watch mode)
npm run dev

# Start worker (separate terminal)
npm run worker:dev
```

### Scripts

```bash
npm run dev          # Start API with hot reload
npm run worker:dev   # Start worker with hot reload
npm run build        # Compile TypeScript
npm run start        # Run compiled API
npm run db:generate  # Generate migration from schema changes
npm run db:migrate   # Run pending migrations
npm run db:seed      # Seed warmup schedule data
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run typecheck    # TypeScript type check
npm run lint         # Lint with Biome
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format code with Biome
```

### Project Structure

```
src/
├── index.ts                 # Server entry point
├── app.ts                   # Fastify app setup and route registration
├── config/
│   └── env.ts               # Zod-validated environment config
├── db/
│   ├── connection.ts        # PostgreSQL pool and Drizzle ORM instance
│   ├── schema/index.ts      # Database table definitions
│   ├── seed.ts              # Warmup schedule seeder
│   └── migrations/          # SQL migration files
├── middleware/
│   ├── auth.ts              # API key authentication (Bearer / Basic)
│   └── error-handler.ts     # Global error handler
├── routes/
│   ├── health.ts            # GET /health
│   ├── domains.ts           # /v1/domains CRUD
│   ├── messages.ts          # /v1/:domain/messages
│   ├── events.ts            # /v1/:domain/events
│   ├── api-keys.ts          # /v1/keys CRUD
│   └── suppressions.ts      # /v1/:domain/suppressions/:type
├── services/
│   ├── dkim.ts              # RSA-2048 DKIM key generation
│   ├── dns-verifier.ts      # Live DNS record verification
│   ├── email-sender.ts      # Message enqueueing logic
│   ├── smtp-transport.ts    # Nodemailer SMTP with DKIM signing
│   └── suppression.ts       # Suppression list checks
├── workers/
│   ├── index.ts             # Worker process entry point
│   └── send-worker.ts       # BullMQ email send processor
├── queues/
│   ├── index.ts             # Redis connection config
│   └── send-queue.ts        # BullMQ queue definition
├── utils/
│   ├── crypto.ts            # API key generation and hashing
│   ├── dns.ts               # DNS record generation and verification
│   └── message-id.ts        # RFC-compliant Message-ID generation
├── admin/                   # Admin UI backend
│   ├── index.ts             # Plugin: sessions, views, static files
│   ├── middleware/
│   │   └── admin-auth.ts    # Session auth, flash messages
│   └── routes/
│       ├── auth.ts          # Login/logout with rate limiting
│       ├── dashboard.ts     # Stats overview
│       ├── domains.ts       # Domain management
│       ├── api-keys.ts      # Key management
│       ├── messages.ts      # Message browser
│       ├── events.ts        # Event log
│       ├── suppressions.ts  # Suppression management
│       └── ip-pools.ts      # IP pool management
├── views/                   # EJS templates for admin UI
└── public/                  # Static assets (JS)
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | API server port |
| `HOST` | No | `0.0.0.0` | API server host |
| `NODE_ENV` | No | `development` | `development` / `production` / `test` |
| `LOG_LEVEL` | No | `info` | `fatal` / `error` / `warn` / `info` / `debug` / `trace` |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `SMTP_HOST` | No | `localhost` | SMTP relay hostname |
| `SMTP_PORT` | No | `25` | SMTP relay port |
| `API_URL` | No | `http://localhost:3000` | Public API base URL |
| `MASTER_API_KEY` | Yes | — | Master API key (min 8 chars) |
| `ADMIN_PASSWORD` | Yes | — | Admin dashboard password (min 8 chars) |
| `SESSION_SECRET` | Yes | — | Session signing secret (min 32 chars) |

## VPS Deployment Guide

### Recommended Setup

A **$5/mo VPS** (1 vCPU, 1 GB RAM) from providers like Hetzner, DigitalOcean, or Vultr is enough to handle tens of thousands of emails per day.

### 1. Server Preparation

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install docker-compose-plugin -y
```

### 2. DNS Configuration

Point your domain's DNS to the VPS IP and set up a reverse DNS (rDNS/PTR) record with your VPS provider. This is critical for deliverability.

| Record | Name | Value |
|--------|------|-------|
| A | `mail.yourdomain.com` | `YOUR_VPS_IP` |
| PTR | `YOUR_VPS_IP` | `mail.yourdomain.com` |

SPF, DKIM, and DMARC records are generated automatically when you add a domain through the API.

### 3. Deploy

```bash
git clone https://github.com/your-org/email-api.git
cd email-api
cp .env.example .env
# Edit .env with production values
docker compose up -d
docker compose exec email-api npx drizzle-kit migrate
docker compose exec email-api node dist/db/seed.js
```

### 4. Reverse Proxy (Optional)

Put the API behind nginx or Caddy with TLS:

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Deliverability Checklist

- [ ] rDNS (PTR record) matches your mail hostname
- [ ] SPF record published and verified
- [ ] DKIM record published and verified
- [ ] DMARC record published and verified
- [ ] Port 25 outbound is open (some VPS providers block it by default — check with your provider)
- [ ] Server IP is not on any blocklist (check at [mxtoolbox.com](https://mxtoolbox.com/blacklists.aspx))

## Security

- **API authentication** — SHA-256 hashed API keys, Bearer and Basic auth
- **Admin auth** — Timing-safe password comparison, session regeneration on login
- **Rate limiting** — Login brute force protection (5 attempts/minute per IP)
- **Session security** — HttpOnly, SameSite=Lax cookies, configurable Secure flag
- **Headers** — X-Frame-Options: DENY, X-Content-Type-Options: nosniff
- **DKIM** — RSA-2048 key pairs, private keys never exposed through API or admin UI

## License

MIT License - Copyright (c) 2026 MB Digisensus. See [LICENSE](LICENSE) for details.

---

[www.digisensus.ai](https://www.digisensus.ai)
