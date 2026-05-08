# CLAUDE.md — Meridian AI Supply Chain

This project is a **multi-agent logistics platform** using AI reasoning (LangChain + Gemini), real-time APIs, and MongoDB.

---

## 🧠 System Overview

Meridian is built around an **AI orchestration system**:

- OrchestratorAgent → central reasoning engine
- Services → domain logic (routing, weather, risk, etc.)
- Controllers → API layer
- MongoDB → persistence
- SSE → real-time updates

---

## 🏗️ Architecture

### Backend
- Node.js + Express + TypeScript
- LangChain + Gemini (AI reasoning)
- MongoDB Atlas (Mongoose)

### Frontend
- `client/` → Vite + React (demo UI)
- `client-next/` → Next.js 14 (main UI, not wired to root scripts)

---

## ⚠️ Critical Rules (DO NOT BREAK)

### 1. ENV Loading Order
- `server/server.ts` MUST load env first
- Required:
  - `MONGODB_URI`
  - `GOOGLE_API_KEY`
  - `GOOGLE_MAPS_API_KEY`

👉 If missing → server exits

---

### 2. OrchestratorAgent
- Located in: `services/OrchestratorAgent.ts`
- Handles:
  - AI reasoning
  - multi-agent coordination
- DO NOT modify blindly
- Always maintain structured output (Zod schemas)

---

### 3. DNS Override (IMPORTANT)
```ts
dns.setServers(['8.8.8.8', '8.8.4.4'])