# Alldrive API (NestJS + Fastify)

See the [project README](../README.md) for the full setup.

```bash
cp .env.example .env
npm install
npm run seed          # creates tables, the first admin, starter fleet and content (only into empty tables)
npm run start:dev     # http://localhost:8000
npm run test:e2e      # uses the alldriveph_test database
npm run lint
```

## The API: one endpoint

Everything goes through `POST /api/v1/rpc` with a JSON body. Name the operations you want, each with
its arguments, and the answer has exactly those keys:

```http
POST /api/v1/rpc
{ "vehicles": { "branch": "davao", "sort": "recommended" }, "meta": {} }

200 { "vehicles": [ { "slug": "...", "name": "...", "daily_rate": 1300, ... } ], "meta": { ... } }
```

- Reads in one request run in parallel. A request that changes data (any `create_`, `update_`,
  `delete_`, `login`...) runs its operations in order. At most 20 operations per request.
- Each operation sends back the fields the website shows for it (shapes in `src/common/views.ts`).
  Lists skip long text (a car's description, a post's content); staff only fields (plate numbers,
  internal notes, drafts) are only sent to staff.
- Field names are snake_case and enum values lowercase (`sedan`, `self_drive`), the same JSON the
  website types in `lib/types.ts` describe. Dates are ISO 8601 and must include a timezone offset.
- Arguments are validated; unknown fields are refused, so a client cannot write other columns.
- Staff sign in with `login` (sets the httpOnly `adp_session` cookie) or send
  `Authorization: Bearer <access_token>`.
- Image uploads: send the file as `multipart/form-data` (field `file`) to the same endpoint. The
  answer is `{ "upload_image": { "url": "/media/..." } }`. Staff only; JPG, PNG or WEBP.

A failure answers with its HTTP status and one error, naming the operation that failed:

```json
422 { "error": { "op": "quote", "message": "Unknown location", "code": "BAD_USER_INPUT", "status": 422,
                 "errors": [{ "field": "pickup_location", "message": "Unknown location" }] } }
```

Codes: `BAD_REQUEST` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409,
`PAYLOAD_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `BAD_USER_INPUT` 422, `RATE_LIMITED` 429,
`INTERNAL_SERVER_ERROR` 500.

### Operations

| Operation | Arguments | Who |
| --- | --- | --- |
| `meta` | | anyone |
| `vehicles` | `category`, `transmission`, `min_seats`, `q`, `featured`, `branch`, `available_from`, `available_to`, `sort`, `include_inactive` | anyone (`include_inactive`: staff) |
| `vehicle` | `slug`, or `id` (staff) | anyone |
| `quote` | `vehicle_id`, `pickup_at`, `return_at`, `pickup_location`, `return_location`, `service_type`, `destination_zone`, `destination`, `extras` | anyone |
| `create_booking` | `input`: the quote fields plus customer details and `accept_terms` | anyone (rate limited) |
| `track_booking` | `reference`, `email` | anyone (rate limited) |
| `services`, `partners` | `include_inactive` | anyone (`include_inactive`: staff) |
| `faqs` | `category`, `include_inactive` | anyone |
| `service` | `slug` | anyone |
| `posts` | `page`, `page_size`, `tag`, `q`, `include_drafts` | anyone (`include_drafts`: staff) |
| `post` | `slug`, or `id` (staff) | anyone |
| `send_contact_message` | `input`: `name`, `email`, `phone`, `subject`, `message` | anyone (rate limited) |
| `login` | `email`, `password` | anyone (rate limited) |
| `logout`, `me` | | anyone |
| `change_password` | `current_password`, `new_password` | signed in |
| `bookings` | `page`, `page_size`, `status`, `q` | staff |
| `booking` | `id` | staff |
| `update_booking` | `id`, `input`: `status`, `admin_notes` | staff |
| `stats` | | staff |
| `messages` | `page`, `page_size`, `unread` | staff |
| `update_message` | `id`, `is_read` | staff |
| `delete_message` | `id` | staff |
| `create_vehicle` / `update_vehicle` / `delete_vehicle` | `input` / `id`, `input` / `id` | staff |
| `create_post` / `update_post` / `delete_post` | same | staff |
| `create_service` / `update_service` / `delete_service` | same | staff |
| `create_partner` / `update_partner` / `delete_partner` | same | staff |
| `create_faq` / `update_faq` / `delete_faq` | same | staff |
| `users` | | admin |
| `create_user` / `update_user` | `input` (with `role`: admin, staff or owner, and `branch` for owners) / `id`, `input` | admin |
| `commissions` | `status` (unpaid, paid, all), `branch`, `page`, `page_size` | staff, admin, branch owner (own branch) |
| `commission_summary` | `branch` | staff, admin, branch owner (own branch) |
| `update_commissions` | `ids`, `status` (paid, unpaid), `payment_note` | admin |
| `settle_branch_commissions` | `branch`, `payment_note` | admin |
| `chat_start` | `message`, `lang`, `page` | anyone (rate limited); answers `{ id, token, messages }` |
| `chat_send` | `id`, `token`, `message` | the visitor holding the token |
| `chat_messages` | `id`, `token` | the visitor holding the token |
| `chats` | `status` (open, closed, all), `page`, `page_size` | staff |
| `chat` | `id` (opening it marks it read) | staff |
| `chat_reply` | `id`, `message` | staff |
| `update_chat` | `id`, `status` | staff |
| `chat_unread` | | staff |

Paged lists answer `{ items, total, page, page_size, pages }`.

**Branch owners** (`role: owner` with a `branch`) work on their own branch only: `stats`,
`bookings`, `booking`, `update_booking` and `resend_booking_email` for bookings picked up there, and
`vehicles` (`include_inactive`), `vehicle` (by id), `create_vehicle`, `update_vehicle` and image
uploads for the cars kept there. They cannot delete or move cars. Everything else answers
`FORBIDDEN`. Only admins create or change accounts.

### Live updates

`GET /api/v1/events` is a Server-Sent Events stream, so the website and the admin panel update
without a refresh. Events are `message` and `conversation` (website chat), `booking` (created or
updated) and `contact` (contact form), each with JSON data.

- `?chat=<id>&token=<token>`: a visitor's own chat messages.
- Signed in staff: every event. A branch owner: the `booking` events of their branch.

Messages typed in the chat are answered by an assistant (`src/modules/chat/chat.bot.ts`) when they
match an active FAQ; otherwise the visitor is told, once, that the team has been notified. The bot
stays quiet while a team member is chatting. With `RATE_LIMIT_STORAGE_URI=redis://...` live events
are shared between API instances through Redis pub/sub.

## Layout

- `src/main.ts`, `src/app.setup.ts` Fastify app: cookies, CORS, compression, security headers,
  `/media` files, multipart uploads, request logging; `src/health.controller.ts` serves `/health`
- `src/rpc.controller.ts` the endpoint: reads the operations, runs them, and turns errors into answers
- `src/app.module.ts` database and service wiring
- `src/entities` TypeORM entities
- `src/modules/*` operations and their validated inputs: `catalog` (meta, vehicles), `bookings`
  (quotes, pricing, bookings), `content` (services, partners, FAQs, blog, contact), `accounts`
  (sign in, team), `admin` (dashboard, uploads)
- `src/common` errors, validation, response shapes (`views.ts`), pagination, rate limits, website
  cache refresh
- `src/database` data source and migrations; `src/cli/seed.ts` starter data

New migration after changing entities: `npm run migration:generate -- src/database/migrations/Name`,
then add it to `migrations` in `src/database/data-source.ts`.

## Production notes

- `ENVIRONMENT=production` enables secure cookies and HSTS, and refuses the default `SECRET_KEY`.
- Pending migrations are applied when the app starts.
- Run several instances with `RATE_LIMIT_STORAGE_URI=redis://...` so rate limits are shared, and
  `TRUST_PROXY=true` behind a reverse proxy.
- Uploaded images live in `media/`; mount it on a persistent volume.
