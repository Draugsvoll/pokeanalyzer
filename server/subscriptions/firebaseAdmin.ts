import "dotenv/config";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccountCredential() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!rawServiceAccount) return applicationDefault();

  const serviceAccount = JSON.parse(rawServiceAccount) as {
    client_email: string;
    private_key: string;
    project_id: string;
  };

  return cert({
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
    projectId: serviceAccount.project_id,
  });
}

const app = getApps()[0] ?? initializeApp({ credential: getServiceAccountCredential() });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
