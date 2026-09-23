# Subscriber notification flow

Reference for feature 14 (`blueprint/history/features/14-notify-subscribers-of-new-blog-posts.md`)
and fix F-11 (`blueprint/history/fixes/throttle-confirmation-resends.md`). Reflects
`main` as of this writing: confirmation is a GET page with a POST button, not a
one-click confirm-on-load link. Update the "Subscribe and confirm" diagram if
that changes.

## 1. Layer map

Entry points handle HTTP. Logic decides what should happen. Storage holds
state. Nothing here talks to Resend or D1 except through the layer below it.

```mermaid
flowchart TB
    subgraph Entry["Entry points (HTTP)"]
        Form["/subscribe form<br/>+ site-wide popup"]
        Action["subscribeToUpdates action<br/>src/actions/index.ts"]
        Confirm["/api/confirm<br/>GET renders, POST mutates"]
        Unsub["/api/unsubscribe<br/>GET renders, POST mutates"]
        Notify["/api/notify<br/>POST only, secret header"]
        Version["/api/version<br/>GET, build commit"]
    end

    subgraph Logic["Logic (pure or thin DB wrappers)"]
        Decision["subscribeDecision.ts<br/>decideSubscribe"]
        Subs["subscriptions.ts<br/>confirm / unsubscribe lookups"]
        NotifyLib["notify.ts<br/>selectNewPosts, chunk, secretsMatch"]
    end

    subgraph Storage["Storage"]
        D1["d1-client.ts"]
        SubscriberT["Subscriber table"]
        PostNotifT["PostNotification table"]
    end

    subgraph External["External"]
        Resend["Resend"]
        GHA["GitHub Actions workflow"]
        CFB["Cloudflare Workers Builds"]
    end

    Form --> Action --> Decision --> D1
    Action --> Resend
    Confirm --> Subs --> D1
    Unsub --> Subs
    Notify --> NotifyLib
    Notify --> D1
    Notify --> Resend
    D1 --> SubscriberT
    D1 --> PostNotifT
    GHA -->|polls| Version
    GHA -->|POST, secret| Notify
    CFB -.deploys after push.-> Version
```

## 2. Subscribe and confirm

Double opt-in. The confirmation email link is a GET (safe for mail-scanner
prefetch); the reader clicks a button on the page to actually confirm.

```mermaid
sequenceDiagram
    actor Reader
    participant Form as /subscribe form
    participant Action as subscribeToUpdates
    participant Decision as decideSubscribe
    participant D1
    participant Resend
    participant ConfirmPage as /api/confirm

    Reader->>Form: submit email, first/last name
    Form->>Action: FormData (+ honeypot, timestamp)
    Action->>Action: honeypot check, 3s timing check
    Action->>D1: look up Subscriber by email
    D1-->>Action: existing row or none
    Action->>Decision: decideSubscribe(existing, input, now)

    alt no existing row
        Decision-->>Action: insert (new token)
    else unconfirmed, last email > 10 min ago
        Decision-->>Action: resend (same token)
    else unconfirmed, last email < 10 min ago
        Decision-->>Action: throttled (no send)
    else active subscriber
        Decision-->>Action: noop
    else previously unsubscribed, last email > 10 min ago
        Decision-->>Action: reactivate (new token)
    end

    opt insert / resend / reactivate
        Action->>D1: write Subscriber row
        Action->>Resend: send confirmation email
        Resend-->>Action: ok or error
        Action->>D1: stamp lastEmailedAt (only on success)
    end

    Action-->>Form: "Check your email to confirm your subscription."
    Note over Form,Reader: Same message in every branch<br/>never reveals list membership

    Reader->>ConfirmPage: GET /api/confirm?token=... (from email)
    ConfirmPage->>D1: look up token
    D1-->>ConfirmPage: pending, already-confirmed, or not-found
    ConfirmPage-->>Reader: page with a "Confirm subscription" button
    Reader->>ConfirmPage: POST (button click)
    ConfirmPage->>D1: set confirmedAt = now
    ConfirmPage-->>Reader: 303 redirect to /subscribed
```

## 3. Publish and notify

Triggered by pushing a blog post, not on a schedule. The workflow waits for
the live deploy to actually contain the new post before calling `/api/notify`.

```mermaid
sequenceDiagram
    actor Owner as Site owner
    participant Main as main branch
    participant CFB as Workers Builds
    participant GHA as notify-subscribers.yml
    participant Version as /api/version
    participant Notify as /api/notify
    participant D1
    participant Resend

    Owner->>Main: push (src/content/blog/** changed)
    Main->>CFB: deploy triggered
    Main->>GHA: workflow triggered (same push)

    loop up to 24 x 15s (6 min)
        GHA->>Version: GET /api/version
        Version-->>GHA: { sha }
        alt sha == github.sha
            Note over GHA: deployed, break loop
        else not yet deployed
            Note over GHA: sleep 15s, retry
        end
    end

    GHA->>Notify: POST /api/notify<br/>x-notify-secret header
    Notify->>Notify: secretsMatch(header, NOTIFY_SECRET)
    Notify->>Notify: getCollection('blog') from deployed bundle
    Notify->>D1: read PostNotification (already-sent slugs)
    Notify->>Notify: selectNewPosts(published, notified, now)
    Note over Notify: excludes drafts, future pubDate,<br/>already-notified slugs

    alt new posts found
        Notify->>D1: read active subscribers<br/>(confirmedAt set, unsubscribedAt null)
        loop each new post
            loop chunks of 100 recipients
                Notify->>Resend: batch.send(emails)
                Resend-->>Notify: ok or error (counted as failed)
            end
            Notify->>D1: insert PostNotification row (onConflictDoNothing)
        end
    end

    Notify-->>GHA: 200 { notified: [{slug, sent, failed}], skipped }
```

## 4. Unsubscribe

Same GET-renders / POST-mutates shape as confirm, and idempotent: clicking
twice is not an error.

```mermaid
sequenceDiagram
    actor Reader
    participant Page as /api/unsubscribe
    participant D1

    Reader->>Page: GET /api/unsubscribe?token=... (from any email)
    Page->>D1: look up token
    D1-->>Page: found (active or already unsubscribed) or not-found
    Page-->>Reader: page with an "Unsubscribe" button
    Reader->>Page: POST (button click)
    Page->>D1: set unsubscribedAt = now (no-op if already set)
    Page-->>Reader: 303 redirect to /unsubscribed
```

## 5. Route reference

| Route | Method | Mutates D1 | Auth | Result |
|---|---|---|---|---|
| `/subscribe` | Action (POST via form) | insert/update `Subscriber` | honeypot + timing | success message, confirmation email sent |
| `/api/confirm?token=` | GET | no | token in URL | HTML page, `pending` / `already-confirmed` / `not-found` |
| `/api/confirm` | POST | `confirmedAt` | token in form body | 303 to `/subscribed`, or 404 page |
| `/api/unsubscribe?token=` | GET | no | token in URL | HTML page, `found` / `already` / `not-found` |
| `/api/unsubscribe` | POST | `unsubscribedAt` | token in form body | 303 to `/unsubscribed` (idempotent) |
| `/api/notify` | POST | insert `PostNotification` | `x-notify-secret` header (timing-safe) | JSON `{ notified, skipped }` |
| `/api/version` | GET | no | none | JSON `{ sha }`, `Cache-Control: no-store` |

Confirm and unsubscribe pages are `noindex, nofollow` and excluded from the
sitemap. `/api/notify` is never crawled (POST only).
