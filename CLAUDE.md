# CLAUDE.md — Hormiglass CRM System

This repository contains the custom CRM application for **Hormiglass** (Sociedad Comercial y de Transportes Valverde e Hijos Ltda.), designed to replace ClickUp and Excel workflows.

---

## Technical Stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Styling**: Tailwind CSS + custom Hormiglass branding (`#F7931F` orange, `#363636` dark grey)
- **Backend & Auth**: Supabase (Postgres Database, Auth, Storage, Realtime)
- **Icons**: Lucide React (`lucide-react`)
- **Hosting**: Vercel

---

## User Accounts & Roles

1. **Admin Principal**: `j.rodrigueztorresss1@gmail.com` (Full access + `/usuarios` management panel)
2. **Usuario de Prueba**: `jert1109.jrt@gmail.com` (Role: `ventas`)
3. **Roles**:
   - `admin`: Acceso total, gestión de usuarios y roles
   - `ventas`: Clientes, cotizaciones, pipeline comercial
   - `finanzas`: Validación de pagos, facturas/boletas, caja y egresos
   - `administracion`: Control previo, comisiones, pólizas de garantía
   - `programacion`: Agenda de despachos, fabricación e instalaciones

---

## Directory Structure

```
projects/hormiglass-crm/
├── app/
│   ├── page.tsx text             ← Dashboard overview
│   ├── login/page.tsx            ← Supabase Auth Login & Switcher
│   ├── usuarios/page.tsx         ← Admin User Management & Access Control
│   ├── clientes/page.tsx         ← Clientes Directory & CRUD
│   ├── clientes/[id]/page.tsx    ← Cliente Ficha & Activity Timeline
│   ├── cotizaciones/page.tsx     ← Cotizaciones List
│   ├── cotizaciones/nuevo/page.tsx ← Cotización Generator (19% IVA)
│   ├── ventas/page.tsx           ← Pipeline (Kanban & Table)
│   ├── proveedores/page.tsx      ← Proveedores & Purchase Orders
│   ├── caja/page.tsx             ← Cash Flow & Financial Statement
│   └── notificaciones/page.tsx   ← Realtime Notification Center
├── components/
│   ├── Navbar.tsx                ← Top header bar with quick user switch
│   └── Sidebar.tsx               ← Navigation sidebar with role filtering
├── lib/
│   ├── context/AuthContext.tsx   ← Auth & Permissions Context
│   ├── supabase/
│   │   ├── client.ts             ← Supabase SSR Browser Client
│   │   └── mock-data.ts          ← Seed/Fallback Mock Data
│   └── types.ts                  ← TypeScript definitions
└── supabase/
    ├── schema.sql                ← Postgres SQL Schema & RLS Policies
    └── seed.sql                  ← Database Seed Script
```

---

## Commands

```bash
# Start development server
npm run dev

# Run build & lint verification
npm run build
npm run lint
```
