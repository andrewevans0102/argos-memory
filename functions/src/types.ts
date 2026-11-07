import type { Timestamp, FieldValue } from "firebase-admin/firestore";

export interface Note {
  id?: string;
  rawText: string;
  title: string;
  summary: string;
  tags: string[];
  actionItems: string[];
  imageUrls: string[];
  hasImages: boolean;
  createdAt: Timestamp | FieldValue;
  dateString: string;
}

export interface IngestNoteRequest {
  text?: string;
  rawText?: string;
  imageUrls?: string[];
  noteId?: string;
}

export interface IngestNoteResponse {
  id: string;
  rawText: string;
  title: string;
  summary: string;
  tags: string[];
  actionItems: string[];
  imageUrls: string[];
  hasImages: boolean;
  dateString: string;
  createdAt: string;
}

export interface ExtractedNoteData {
  title: string;
  summary: string;
  tags: string[];
  actionItems: string[];
}

export interface MediaUrl {
  noteTitle: string;
  url: string;
}

export interface ActionItem {
  id?: string;
  text: string;
  completed: boolean;
  createdAt: Timestamp | FieldValue;
  completedAt?: Timestamp | FieldValue | null;
  sourceDigestDate?: string;
  sourceNoteId?: string;
}

export interface ActionItemEmailView {
  id?: string;
  text: string;
  completed: boolean;
  isNew?: boolean;
}

export interface Digest {
  id?: string;
  date: string;
  contentMarkdown: string;
  noteCount: number;
  noteIds: string[];
  mediaUrls: MediaUrl[];
  emailMessageId: string | null;
  createdAt: Timestamp | FieldValue;
}

export interface UserProfileConfig {
  email?: string;
  timezone?: string;
  digestHour?: number;
  emailNotificationsEnabled?: boolean;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface DailyDigestResult {
  userId: string;
  date: string;
  skipped: boolean;
  reason?: string;
  noteCount: number;
  digestId?: string;
  emailMessageId?: string | null;
}

export interface TriggerDigestRequest {
  date?: string;
  force?: boolean;
  recipientEmail?: string;
  sendEmail?: boolean;
}

export interface SendTestEmailRequest {
  recipientEmail?: string;
}

export interface SendTestEmailResponse {
  success: boolean;
  messageId: string | null;
  recipient: string;
  timestamp: string;
}

export interface QueryNotesRequest {
  query: string;
  limit?: number;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
}

export interface CitedNote {
  id: string;
  title: string;
  dateString: string;
  summary: string;
  tags: string[];
  actionItems?: string[];
  hasImages: boolean;
  imageUrls?: string[];
}

export interface QueryNotesResponse {
  query: string;
  answer: string;
  citedNotes: CitedNote[];
  candidateCount: number;
  timestamp: string;
}

