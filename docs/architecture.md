# Argos Memory Architecture

Argos Memory is a self-hosted Progressive Web App. Each deployment uses its own Firebase project and provider credentials. The browser handles capture and presentation; Firebase Functions coordinate authenticated AI processing, persistence, scheduling, and email delivery.

## System layout

```mermaid
flowchart LR
    subgraph Device[User device]
        PWA[React and TypeScript PWA]
        SW[Workbox service worker]
        PWA --- SW
    end

    subgraph Firebase[Self-hosted Firebase project]
        Auth[Firebase Authentication]
        Hosting[Firebase Hosting]
        Functions[Cloud Functions 2nd gen]
        Firestore[(Cloud Firestore)]
        Storage[(Cloud Storage)]
        Scheduler[Cloud Scheduler]
    end

    Gemini[Google Gemini API]
    Resend[Resend email API]

    PWA -->|Sign in and identity token| Auth
    Hosting -->|Serves PWA bundle| PWA
    PWA -->|Callable HTTPS requests| Functions
    PWA <-->|User-owned live data and offline cache| Firestore
    PWA -->|Compressed image uploads| Storage
    Functions -->|Read and write user data| Firestore
    Functions -->|Read uploaded images| Storage
    Functions -->|Extract, summarize, answer| Gemini
    Scheduler -->|Scheduled digest run| Functions
    Functions -->|Deliver digest email| Resend
```

## Data layout

All user records are scoped below the Firebase Authentication UID. Firestore and Storage rules restrict client access to that user's records, and callable functions require an authenticated user. Note ingestion, search, and digest operations also apply the optional server-side email allowlist.

```mermaid
flowchart TB
    UID[Firebase Auth UID]
    UID --> Profile[users/uid/profile/config<br/>email, timezone, digest preferences]
    UID --> Notes[users/uid/notes/noteId<br/>source text, summary, tags, actions, image URLs]
    UID --> Actions[users/uid/actions/actionId<br/>pending and completed follow-ups]
    UID --> Digests[users/uid/digests/date<br/>daily markdown, note references, media]
    Notes --> Images[Cloud Storage<br/>users/uid/notes/noteId/file]
```

## Note capture and ingestion

Text is sent to `ingestNote`. Images are resized and compressed in the browser, uploaded directly to Storage, then passed to the function as download URLs. Gemini extracts a title, summary, tags, and action items. If Gemini is unavailable, a deterministic fallback still allows the note to be saved.

```mermaid
sequenceDiagram
    actor User
    participant PWA as Argos Memory PWA
    participant Storage as Firebase Storage
    participant Ingest as ingestNote function
    participant Gemini as Gemini API
    participant DB as Cloud Firestore

    User->>PWA: Enter text and optionally attach images
    opt Images attached
        PWA->>PWA: Resize and compress images to WebP
        PWA->>Storage: Upload under users/uid/notes/noteId/
        Storage-->>PWA: Return image download URLs
    end
    PWA->>Ingest: Callable request with text, URLs, and auth token
    Ingest->>Ingest: Verify authentication and optional email allowlist
    Ingest->>DB: Read profile timezone
    Ingest->>Gemini: Extract structured note data and inspect images
    alt Gemini succeeds
        Gemini-->>Ingest: Title, summary, tags, and action items
    else Gemini unavailable
        Ingest->>Ingest: Build deterministic fallback note data
    end
    Ingest->>DB: Save note and deduplicated action items
    Ingest-->>PWA: Return saved note
    PWA-->>User: Show success and updated note feed
```

## Search and daily digest processing

`queryNotes` loads a bounded pool of the user's recent notes (or notes in the requested date range), ranks candidates locally, and asks Gemini to answer using those candidates. The daily digest function runs on its configured schedule, skips dates with no notes, synthesizes a briefing, syncs action items, optionally sends email, and saves the digest archive.

```mermaid
sequenceDiagram
    participant PWA as Argos Memory PWA
    participant Callable as queryNotes function
    participant DB as Cloud Firestore
    participant Gemini as Gemini API
    participant Scheduler as Cloud Scheduler
    participant Digest as generateDailyDigest function
    participant Resend as Resend API

    PWA->>Callable: Ask a question with auth token
    Callable->>DB: Read up to 100 notes for this user
    Callable->>Callable: Rank and select relevant candidates
    Callable->>Gemini: Synthesize answer from selected notes
    Gemini-->>Callable: Answer and cited note IDs
    Callable-->>PWA: Answer with cited notes

    Scheduler->>Digest: Run on configured cron schedule
    Digest->>DB: Load user profile and previous-day notes
    alt No notes or digest already exists
        Digest->>Digest: Skip synthesis (unless forced regeneration)
    else Notes found
        Digest->>Gemini: Synthesize daily briefing
        Gemini-->>Digest: Markdown digest
        Digest->>DB: Sync deduplicated action items
        opt Email enabled and address available
            Digest->>Resend: Send HTML and text briefing
        end
        Digest->>DB: Save digest archive and media references
    end
```

## Security and deployment boundaries

- Intended for personal, single-user (or small trusted-household) self-hosted Firebase deployments rather than public multi-tenant SaaS hosting.
- The deployment owner operates Firebase, Gemini, and Resend accounts and pays any applicable usage charges.
- Firebase Auth identifies users. Firestore and Storage security rules scope direct client access to the authenticated user's UID; for personal instances, configure `ALLOWED_EMAILS` / `VITE_ALLOWED_EMAILS` and consider disabling open sign-ups in Firebase Authentication after creating your account.
- Callable functions validate authentication. Note ingestion, search, and digest operations also enforce `ALLOWED_EMAILS` when configured.
- Gemini and Resend credentials stay in Firebase Secret Manager for deployed functions. Emulator secrets are stored locally and excluded from Git.
- The PWA uses Workbox for application asset caching and Firestore's persistent local cache for offline data access.
