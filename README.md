# عقاري - Uqari PMS

**Property Management System** for elderly landlords in Saudi Arabia and Sudan.

## Architecture

```
├── /server          Express REST API (port 3001)
│   ├── server.js    Entry point
│   ├── database.js  SQLite schema + init
│   ├── seed.js      Seed data script
│   ├── controllers/ Route handlers
│   ├── routes/      Express route definitions
│   ├── middleware/   JWT auth middleware
│   ├── cron/        Financial cron engine
│   └── data/        SQLite database files
├── /client          React SPA (port 5173)
│   ├── src/
│   │   ├── api/         Axios configuration
│   │   ├── components/  React components
│   │   │   ├── layout/  Shell layout + sidebar
│   │   │   ├── shared/  Reusable (Modal, etc.)
│   │   │   └── pages/   12 page views
│   │   └── App.jsx      Router entry
│   └── vite.config.js   Vite + proxy config
├── package.json     Root orchestrator
└── README.md
```

## Quick Start

```bash
# 1. Install all dependencies
npm install              # root (concurrently)
cd server && npm install # backend (express, sqlite, ...)
cd ../client && npm install # frontend (react, vite, ...)

# 2. Seed the database (first time only)
cd ../server && npm run seed

# 3. Start both servers
cd .. && npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001/api
- **Demo login**: `ahmed@example.com` / `secret123`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both backend + frontend |
| `npm run dev:server` | Start backend only (port 3001) |
| `npm run dev:client` | Start frontend only (port 5173) |
| `npm run seed` | Reset and seed database |
| `npm run build` | Build frontend for production |

## Tech Stack

- **Backend**: Node.js, Express 5, better-sqlite3, JWT, bcrypt
- **Frontend**: React 19, React Router 7, Axios, Vite 6
- **Design**: Cairo font, Glassmorphism, RTL, Dark Navy theme

## API Endpoints

30+ endpoints under `/api/` — auth, properties, units, tenants, contracts,
invoices, payments, expenses, maintenance, dashboard, sync. See source for
full reference.
