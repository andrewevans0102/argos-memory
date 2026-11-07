# Argos Memory User Workflows

These diagrams show the main actions available to a user after opening their self-hosted Argos Memory instance.

## Sign up, sign in, and profile setup

New accounts use Firebase Email/Password authentication. Registration can be restricted with the optional frontend email allowlist. The app creates a per-user profile with the account email, detected timezone, a 6:00 AM digest hour, and email notifications enabled by default.

```mermaid
flowchart TD
    Open[Open Argos Memory] --> AuthState{Already signed in?}
    AuthState -->|Yes| Shell[Open app shell]
    AuthState -->|No| AuthScreen[Show sign-in screen]
    AuthScreen --> Choice{Choose action}
    Choice -->|Sign in| SignIn[Authenticate with email and password]
    SignIn --> Shell
    Choice -->|Reset password| Reset[Send password reset email]
    Reset --> AuthScreen
    Choice -->|Create account| Whitelist{Email allowed by optional whitelist?}
    Whitelist -->|No| Rejected[Show access restricted message]
    Rejected --> AuthScreen
    Whitelist -->|Yes| Create[Create Firebase Auth account]
    Create --> Profile[Create profile with email, timezone, and digest defaults]
    Profile --> Shell
    Shell --> Views[Capture, Recent, Search, Actions, and Digests]
```

## Capture a note or image

Users can type text, attach images, paste screenshots, or drag and drop images. The app compresses images in the browser before uploading them. Once saved, extracted action items appear in the Actions view as well as on the note.

```mermaid
flowchart TD
    Start[Open Capture] --> Input{What are you capturing?}
    Input -->|Text| Text[Enter note text]
    Input -->|Image or screenshot| Image[Attach, paste, or drop image]
    Image --> Compress[Resize and compress image in browser]
    Text --> Submit[Submit capture]
    Compress --> Submit
    Submit --> Upload{Any images?}
    Upload -->|Yes| Store[Upload images to user's Storage path]
    Upload -->|No| Ingest
    Store --> Ingest[Call ingestNote with text and image URLs]
    Ingest --> Check[Authenticate and validate request]
    Check --> ModelAvailable{Gemini available?}
    ModelAvailable -->|Yes| Extract[Gemini extracts title, summary, tags, and actions]
    ModelAvailable -->|No| Basic[Create deterministic fallback fields]
    Extract --> Persist[Save note and new action items to Firestore]
    Basic --> Persist
    Persist --> Feed[Show saved note in Recent and Capture]
    Persist --> Actions[Show extracted follow-ups in Actions]
```

## Find something from memory

Search uses a bounded note candidate set, not the entire account history. The function ranks matching notes, asks Gemini to synthesize an answer from those notes, and returns the sources so the user can check the context.

```mermaid
flowchart LR
    Ask[Ask a natural-language question] --> Function[Call queryNotes]
    Function --> Read[Load recent notes or requested date range]
    Read --> Rank[Rank notes by phrase, keyword, tag, and date matches]
    Rank --> Candidates[Select up to the requested candidate limit]
    Candidates --> Answer[Gemini answers using candidate notes]
    Answer --> Cite[Return answer and cited note IDs]
    Cite --> Results[Show answer, dates, tags, and cited note cards]
```

## Review and manage action items

Action items can be extracted during note capture or discovered while a daily digest is generated. Users can also add tasks manually, mark them complete, filter/search them, or delete them.

```mermaid
flowchart TD
    Source{Where did the action come from?}
    Source -->|Note capture| NoteExtract[Extract from note with Gemini]
    Source -->|Daily digest| DigestExtract[Extract from digest and note metadata]
    Source -->|User entry| Manual[Add action manually]
    NoteExtract --> Dedup[Deduplicate against pending actions]
    DigestExtract --> Dedup
    Manual --> Save[Save to user's actions collection]
    Dedup --> Save
    Save --> List[Actions view updates in real time]
    List --> Manage{User action}
    Manage -->|Complete or reopen| Toggle[Update completion state]
    Manage -->|Search/filter| Filter[Show matching actions]
    Manage -->|Delete| Remove[Delete action]
```

## Daily digest and archive

At the configured schedule, the backend considers each user's timezone and previous-day notes. A zero-activity day is skipped. Users can also trigger a digest for a selected date from the Digests view; existing digests are skipped unless force regeneration is enabled.

```mermaid
flowchart TD
    Trigger{How is the digest started?}
    Trigger -->|Scheduled run| Cron[Cloud Scheduler invokes digest function]
    Trigger -->|Manual run| Manual[User selects date and triggers generation]
    Cron --> Load[Load profile and notes for target date]
    Manual --> Load
    Load --> Existing{Digest already exists and force is off?}
    Existing -->|Yes| SkipExisting[Report already generated]
    Existing -->|No| HasNotes{Any notes for target date?}
    HasNotes -->|No| SkipEmpty[Skip synthesis and email]
    HasNotes -->|Yes| Summarize[Gemini synthesizes Markdown briefing]
    Summarize --> Sync[Sync deduplicated action items]
    Sync --> Email{Email enabled and address available?}
    Email -->|Yes| Send[Send digest through Resend]
    Email -->|No| Archive
    Send --> Archive[Save digest and media references in Firestore]
    Send --> Inbox[Optional email delivery]
    Archive --> App[Show in Digests archive]
    App --> Manage[Read, copy, or delete archived digest]
```
