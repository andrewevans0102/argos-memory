import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { info } from "firebase-functions/logger";

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Health check callable function to verify client-backend connectivity.
 */
export const healthCheck = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    info("Health check called by user:", request.auth.uid);
    return {
      status: "ok",
      uid: request.auth.uid,
      timestamp: new Date().toISOString(),
    };
  }
);

/**
 * Ingestion engine callable function for notes & multimodal extraction.
 */
export { ingestNote } from "./ingestNote.js";

/**
 * Daily digest scheduled & callable functions.
 */
export { generateDailyDigest, triggerDailyDigest, sendTestEmail } from "./dailyDigest.js";

/**
 * Natural language memory search callable function.
 */
export { queryNotes } from "./queryNotes.js";

