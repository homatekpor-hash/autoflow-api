# ShopLink API

Multi-workshop management platform — Node.js + Express + Prisma + PostgreSQL.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in your environment variables
cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET, etc.

# 3. Run database migrations
npm run db:migrate

# 4. Seed with sample data
npm run db:seed

# 5. Start the development server
npm run dev
```

Server runs on `http://localhost:3001`.

---

## User roles

| Role        | Scope                                       |
|-------------|---------------------------------------------|
| OWNER       | Full access — all workshops, all reports     |
| MANAGER     | One workshop — jobs, staff, reports, estimates |
| TECHNICIAN  | Own assigned jobs only                      |
| RECEPTION   | Check-in and job intake only                |

---

## API reference

All protected routes require `Authorization: Bearer <token>`.

### Auth
| Method | Endpoint                   | Auth    | Description              |
|--------|----------------------------|---------|--------------------------|
| POST   | /api/auth/login            | Public  | Login, returns JWT        |
| GET    | /api/auth/me               | Any     | Current user info         |
| POST   | /api/auth/change-password  | Any     | Update password           |

### Workshops
| Method | Endpoint                      | Auth            | Description               |
|--------|-------------------------------|-----------------|---------------------------|
| GET    | /api/workshops                | Any             | List workshops            |
| GET    | /api/workshops/:id            | Any             | Workshop detail           |
| POST   | /api/workshops                | Owner           | Create workshop           |
| PUT    | /api/workshops/:id            | Owner, Manager  | Update workshop           |
| GET    | /api/workshops/:id/qrcode     | Any             | Get QR code (PNG/SVG/URL) |
| GET    | /api/workshops/:id/jobs       | Any             | Jobs for a workshop       |

### Jobs
| Method | Endpoint                | Auth                      | Description              |
|--------|-------------------------|---------------------------|--------------------------|
| GET    | /api/jobs               | Any                       | List jobs (with filters) |
| GET    | /api/jobs/:id           | Any                       | Job detail + history      |
| PUT    | /api/jobs/:id/status    | Owner, Manager, Tech      | Update job status         |
| PUT    | /api/jobs/:id/assign    | Owner, Manager            | Assign technician         |
| GET    | /api/jobs/:id/history   | Any                       | Status history            |
| GET    | /api/jobs/:id/estimate  | Any                       | Get estimate for job      |
| POST   | /api/jobs/:id/estimate  | Owner, Manager, Tech      | Create estimate           |

### Check-in (public — no auth)
| Method | Endpoint                           | Description                       |
|--------|------------------------------------|-----------------------------------|
| GET    | /api/checkin/workshop/:qrToken     | Get workshop info for QR page      |
| POST   | /api/checkin                       | Submit customer check-in form      |
| GET    | /api/checkin/track/:trackingToken  | Track job status (customer-facing) |

### Estimates
| Method | Endpoint                    | Auth                 | Description              |
|--------|-----------------------------|----------------------|--------------------------|
| PUT    | /api/estimates/:id          | Owner, Manager, Tech | Update estimate items    |
| POST   | /api/estimates/:id/send     | Owner, Manager, Tech | Send estimate to customer|
| POST   | /api/estimates/approve/:token | Public             | Customer approves         |
| POST   | /api/estimates/reject/:token  | Public             | Customer rejects          |

### Users / Team
| Method | Endpoint             | Auth            | Description          |
|--------|----------------------|-----------------|----------------------|
| GET    | /api/users           | Owner, Manager  | List team members     |
| POST   | /api/users/invite    | Owner, Manager  | Invite a new member  |
| PUT    | /api/users/:id       | Owner, Manager  | Update user/role      |
| DELETE | /api/users/:id       | Owner           | Deactivate user       |

### Reports
| Method | Endpoint                  | Auth            | Description          |
|--------|---------------------------|-----------------|----------------------|
| GET    | /api/reports/revenue      | Owner, Manager  | Revenue by workshop   |
| GET    | /api/reports/jobs         | Owner, Manager  | Job counts & status   |
| GET    | /api/reports/performance  | Owner, Manager  | Avg times, top techs  |

All report endpoints accept `?from=YYYY-MM-DD&to=YYYY-MM-DD` query params.

---

## Key flows

### Customer QR check-in
1. Workshop scans `GET /api/workshops/:id/qrcode` → gets PNG + unique URL
2. URL displayed at reception (printed or screen)
3. Driver scans → browser opens `/checkin/{qrToken}`
4. Frontend calls `GET /api/checkin/workshop/{qrToken}` → gets workshop name
5. Driver fills form → frontend calls `POST /api/checkin`
6. API creates vehicle + job, returns `trackingToken`
7. Driver gets SMS: `"Track your job: {FRONTEND_URL}/track/{trackingToken}"`

### Estimate → approval
1. Tech builds estimate via `POST /api/jobs/:id/estimate`
2. Manager calls `POST /api/estimates/:id/send` → status becomes SENT, customer gets SMS
3. Customer taps link → frontend calls `GET /api/checkin/track/:token` to show estimate
4. Customer taps Approve → `POST /api/estimates/approve/:token`
5. Workshop gets notified, work continues

### Status notifications
Every call to `PUT /api/jobs/:id/status` triggers an SMS to the customer automatically.

---

## Tech stack

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **ORM**: Prisma 5 + PostgreSQL
- **Auth**: JWT (jsonwebtoken) + bcrypt
- **SMS**: Twilio (mocked in dev if env vars missing)
- **QR codes**: qrcode (server-side generation)
- **Validation**: express-validator

## Recommended hosting
- **API**: Railway, Render, or Fly.io
- **Database**: Neon (serverless Postgres) or Supabase
- **Frontend**: Vercel (Next.js)
