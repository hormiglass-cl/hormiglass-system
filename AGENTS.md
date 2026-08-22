<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [hormiglass-system] recent context, 2026-08-21 10:59pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,088t read) | 785,184t work | 97% savings

### Jul 20, 2026
S152 Crear CRM propio para Hormiglass con Next.js + Supabase + Vercel, incluyendo CLAUDE.md y archivo de memoria del proyecto (Jul 20 at 2:08 PM)
S153 User provided PDF quotation example and config/ files; session is now setting up the .claude project directory with MCP configs and permissions before plan execution (Jul 20 at 2:09 PM)
S154 User provided quotation PDF and config files; session completed full Fase 0 documentation setup without executing the implementation plan (Jul 20 at 2:45 PM)
S155 Install Supabase MCP server for the Hormiglass project pointing to specific project ref jvenwcupdllcqbxixcuo (Jul 20 at 2:47 PM)
S156 Plan file confirmed moved to plans/crm-hormiglass-plan.md and memory file updated with new path (Jul 20 at 2:50 PM)
S157 Traer código CRM de la rama execute-crm-hormiglass-plan al proyecto hormiglass-system y dejarlo corriendo localmente (Jul 20 at 2:52 PM)
S158 Sincronizar archivos del worktree CRM al directorio local hormiglass-system y subir al repositorio dedicado https://github.com/jrodrigueezt/hormiglass-system.git (Jul 20 at 3:12 PM)
### Jul 21, 2026
S159 Sincronizar archivos CRM del worktree al local hormiglass-system y subir a GitHub repo dedicado — COMPLETADO (Jul 21 at 12:27 PM)
S174 Security hardening + Supabase single-source-of-truth plan for hormiglass-system CRM (Next.js 15 + Supabase) (Jul 21 at 12:30 PM)
### Aug 5, 2026
S175 Fix Supabase MCP connection error "resource: Resource must be a valid MCP endpoint" in hormiglass-system project (Aug 5 at 10:00 PM)
### Aug 20, 2026
794 11:05p 🔵 Hormiglass CRM Database Schema — ordenes_compra Current Structure
795 " 🔵 Hormiglass CRM Full Schema Map — 17 Tables, Security Gaps Documented
796 11:08p ✅ schema.sql Updated to Reflect Migrations 0008–0013 State
797 " ✅ schema.sql Table Ordering Fixed — personal_terreno Moved Before Its Dependents
798 " ✅ schema.sql Index Definitions Added for All New Tables
799 11:09p 🔵 RLS Helper Functions and Full Policy Architecture Documented
800 " ✅ schema.sql Now Includes RLS Helper Functions Documentation
801 11:10p ✅ Schema Documentation Phase Completed — Moving to New Feature Implementation
802 " 🔵 New Verification Plan Started Before Feature Implementation
804 " 🔵 Critical Role Constraint Mismatch — DB Allows Only 'admin'|'user' But App Expects Full Role Set
805 " 🔵 Production Data State — Clean Slate for OC Feature Implementation
803 " ✅ supabase/schema.sql Updated as Complete Schema Snapshot
806 11:11p 🔴 Migration 0014 Applied — OC RLS Policies Aligned to Actual 'admin'|'user' Role System
807 11:12p 🔵 Migration 0014 Confirmed Applied — Live RLS Policies Verified in Production
808 " 🔵 RLS Helper Functions Confirmed Fail-Closed Without JWT
809 " 🔵 RLS Helper Functions Verified With Simulated User JWT
810 " 🔵 Full RLS End-to-End Test Passed for ordenes_compra With 'user' Role
811 " ✅ schema.sql Updated to Reflect Migration 0014 Policy Changes
812 11:15p 🔴 Critical RLS Role Mismatch Fixed — Legacy Roles Blocked All Operational Users
### Aug 21, 2026
813 8:37p 🔵 Hormiglass CRM — Implementation Plans 12 & 13 Review Session Started
814 " 🔵 Hormiglass Plan 12 — DB Migrations Fully Applied, UI Implementation Confirmed
815 " 🔵 Hormiglass Project Stack — Next.js 16 + React 19 + Supabase JS 2.110
816 8:38p 🟣 Plan 12 — All 6 Phases Fully Implemented in UI Code
817 " 🔵 Plan 13 A.2 Incomplete — Smile Icon and AtSign Button Remain in Activity Feed Toolbar
818 " 🟣 Plan 13 C — 3-Column HubSpot-Style Client Profile Fully Implemented
819 " 🟣 Plan 13 D — Clients Table Has Ejecutivo Column; Dirección/Ubicación Removed
822 8:39p 🟣 New Feature Requests: Edit/Delete Events in Oportunidades, Typography Scale, Client Info Panel, Tags Layout
820 " 🔵 Hormiglass CRM Implementation Audit: Plans 12 & 13 Partial Completion
821 " 🔵 Build Passes Clean but ESLint Has 211 Problems Across Codebase
823 8:49p 🔵 Git Status: 50+ Files Uncommitted Across Plans 8–13
824 " 🔵 actividades_op.tipo Has No CHECK Constraint — Free TEXT in Schema and All Migrations
825 " 🔵 Ventas Page Structure: Client Contact Inside Área Comercial Accordion
826 " 🔵 Event Cards in Ventas: Read-Only, No Edit/Delete; Both Sections Share Unfiltered opEventosProdLog
827 8:50p 🔵 Ventas Page State: Edit/Delete Exists for Visitas but Not for ProdLog Events; No editingProdLogId State
828 " 🔴 Migration 0031 Fixed: Added CHECK Constraint on actividades_op.tipo
829 " 🔴 Removed (c as any) Casts in clientes/[id] and Added Typed Imports to ventas/page
830 " 🟣 Added Typed State for ProdLog Event Edit/Delete in ventas/page.tsx
831 " 🔄 Unified ProdLog Estado Options to Match Migration 0028's 5 New Estado Values
832 8:51p 🟣 Added Edit/Delete Handler Functions for ProdLog Events in ventas/page.tsx
833 " 🔵 apply_patch Failed for produccionEventos/reventaEventos Filter Variables — Context Mismatch
834 8:52p 🔴 Fixed: produccionEventos and reventaEventos Derived Arrays Added Before JSX Return
835 " 🟣 Client Info Panel Moved Above Área Comercial in Oportunidad Detail
836 " 🔵 Old "Contacto del Cliente" Accordion Confirmed at Lines 2980–3063 Inside areaExpanded.comercial
837 " 🔄 Removed Duplicate "Contacto del Cliente" Accordion from Área Comercial
838 8:53p ✅ Tags Grid Layout Changed from 6-Column to 2-Column in Oportunidad Attribute Strip
839 " 🔴 Producción Section Badge and "Agregar Evento" Button Now Use Filtered produccionEventos Array
840 " 🔵 Old Inline Save Handler and opEventosProdLog.map() Still Present in Producción Section
841 " 🔄 Producción Section Save Handler Replaced with saveProdLogEvent(); Event List Now Uses produccionEventos
842 8:54p 🔵 Producción Event Cards Confirmed Read-Only at Lines 4599–4629; Card JSX Needs Edit/Delete Buttons
843 " 🟣 Pipeline left panel: scrollable layout request for ventas/page.tsx

Access 785k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>