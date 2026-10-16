# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite for the client, Python FastAPI for the API, PostgreSQL for persistent data. Docker Compose for local launch; Render for the API and Vercel for the client.

## Users

Clients of IC Group / IC Line need to see their own objects, agreed services, work progress, documents, and quality requests. Managers, subcontractors, and workers have separate roles described in [TZ.md](TZ.md).

## Product Purpose

Connect a cleaning estimate and request to a client contract, service delivery, quality control, monthly acceptance, and payments.

## Capabilities and Constraints

- Client access is limited to the client's organization. Internal costs and subcontractor terms are never part of client responses.
- A client contract appears only after a manager has prepared it. Displaying it does not imply signature.
- Quality requests first reach IC Group; executors see them only after a manager forwards them.
- Demo data may come from the participant package and must be identified as demo data.
- Current implementation starts with the client cabinet overview. Other routes follow in later steps.

## Evidence on Hand

- `TZ.md` defines the workflows and acceptance scenarios.
- `IC HACK 2026 — пакет участника/2_Таблицы/06_Портфель_клиентов.xlsx` contains client and object totals.
- `IC HACK 2026 — пакет участника/1_Договоры/` contains source contracts.

## Product Principles

- Show source-backed facts and make missing operational data explicit.
- Keep client data isolated on the API, not only in the interface.
- Preserve the version and source of contractual and financial facts.
