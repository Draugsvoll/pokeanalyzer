import "dotenv/config";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccountConfiguration() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!rawServiceAccount) {
    const projectId =
      process.env.FIREBASE_PROJECT_ID?.trim() ||
      process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
      process.env.GCLOUD_PROJECT?.trim() ||
      undefined;
    return {
      credential: applicationDefault(),
      projectId,
    };
  }

  const serviceAccount = JSON.parse(rawServiceAccount) as {
    client_email: string;
    private_key: string;
    project_id: string;
  };

  return {
    credential: cert({
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
      projectId: serviceAccount.project_id,
    }),
    projectId: serviceAccount.project_id,
  };
}

const serviceAccountConfiguration = getServiceAccountConfiguration();
const app =
  getApps()[0] ??
  initializeApp({
    credential: serviceAccountConfiguration.credential,
    ...(serviceAccountConfiguration.projectId && {
      projectId: serviceAccountConfiguration.projectId,
    }),
  });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const adminProjectId =
  app.options.projectId ?? serviceAccountConfiguration.projectId ?? null;
