import type { Timestamp } from 'firebase/firestore';

export interface Note {
  id: string;
  rawText: string;
  title: string;
  summary: string;
  tags: string[];
  actionItems: string[];
  imageUrls: string[];
  hasImages: boolean;
  createdAt?: Timestamp | null;
  dateString: string;
}

export interface IngestNotePayload {
  rawText?: string;
  text?: string;
  imageUrls?: string[];
  noteId?: string;
}

export interface IngestNoteResult {
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

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedBlob: Blob;
  compressedSize: number;
  width: number;
  height: number;
  mimeType: string;
}

export interface MediaUrl {
  noteTitle: string;
  url: string;
}

export interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  sourceDigestDate?: string;
  sourceNoteId?: string;
}

export interface Digest {
  id: string;
  date: string;
  contentMarkdown: string;
  noteCount: number;
  noteIds: string[];
  mediaUrls: MediaUrl[];
  emailMessageId?: string | null;
  createdAt?: Timestamp | null;
}

export interface TriggerDigestPayload {
  date?: string;
  force?: boolean;
  recipientEmail?: string;
  sendEmail?: boolean;
}

export interface TriggerDigestResult {
  userId: string;
  date: string;
  skipped: boolean;
  reason?: string;
  noteCount: number;
  digestId?: string;
  emailMessageId?: string | null;
}

export interface SendTestEmailPayload {
  recipientEmail?: string;
}

export interface SendTestEmailResult {
  success: boolean;
  messageId?: string | null;
  recipient: string;
  timestamp: string;
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

export interface QueryNotesPayload {
  query: string;
  limit?: number;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
}

export interface QueryNotesResult {
  query: string;
  answer: string;
  citedNotes: CitedNote[];
  candidateCount: number;
  timestamp: string;
}

