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
- The public entry is a multi-object cleaning request. Visitors may complete it anonymously; submission requires registration or sign-in. Registration uses email/password with name, phone and company. Drafts survive registration.
- Submitted requests retain the client's identity and an immutable snapshot of object/service inputs. Managers access these through a role-protected API; a staff UI is a later step.
- The current form requests a manager's estimate. It must not invent prices before the versioned calculation engine is implemented.
- The existing package-based cabinet remains an explicitly labelled demo, separate from a newly registered client's data.

## Brand Commitment

The user explicitly requested a complete redesign based on https://www.ic-group.kz/: authentic logo, Montserrat, white grounds, graphite, lime green, generous whitespace and rounded dark controls. This replaces the previous teal service-journal identity. Preserve accessible contrast by using dark green for small green text.

## Evidence on Hand

- `TZ.md` defines the workflows and acceptance scenarios.
- `IC HACK 2026 — пакет участника/2_Таблицы/06_Портфель_клиентов.xlsx` contains client and object totals.
- `IC HACK 2026 — пакет участника/1_Договоры/` contains source contracts.

## Product Principles

- Show source-backed facts and make missing operational data explicit.
- Keep client data isolated on the API, not only in the interface.
- Preserve the version and source of contractual and financial facts.
