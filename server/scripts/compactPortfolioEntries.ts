import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { logError } from "../security/logging.js";
import {
  adminDb,
  adminProjectId,
} from "../subscriptions/firebaseAdmin.js";
import {
  compactPortfolioDocument,
  getPortfolioExtraFields,
  getProtectedPortfolioFields,
  isPortfolioDocumentCompact,
  isKnownLegacyPortfolioCardField,
} from "./portfolioCompactionHelpers.js";

const CARD_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

function isUserPortfolioPath(documentPath: string): boolean {
  const segments = documentPath.split("/");
  return (
    segments.length === 4 &&
    segments[0] === "users" &&
    Boolean(segments[1]) &&
    segments[2] === "portfolio" &&
    CARD_ID_PATTERN.test(segments[3])
  );
}

function redactPortfolioPath(documentPath: string): string {
  const segments = documentPath.split("/");
  return `users/<uid>/portfolio/${segments.at(-1) ?? "<card>"}`;
}

function approximateJsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

async function compactCurrentDocument(
  reference: DocumentReference<DocumentData>,
): Promise<boolean> {
  return adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    if (!current.exists) return false;

    const data = current.data() as Record<string, unknown>;
    if (getProtectedPortfolioFields(data).length > 0) return false;

    const compact = compactPortfolioDocument(data);
    if (isPortfolioDocumentCompact(data, compact)) return false;

    // A transaction re-reads the latest quantity/source before replacing the
    // legacy payload, so a concurrent user edit cannot be overwritten.
    transaction.set(reference, compact);
    return true;
  });
}

export async function compactLegacyPortfolioEntries(
  applyChanges: boolean,
  expectedProjectId?: string,
): Promise<void> {
  const projectId = adminProjectId;
  if (
    applyChanges &&
    (!projectId || !expectedProjectId || expectedProjectId !== projectId)
  ) {
    throw new Error(
      projectId
        ? `Refusing portfolio writes. Pass --project=${projectId} to confirm the active Firebase project.`
        : "Refusing portfolio writes because the active Firebase project ID could not be determined.",
    );
  }

  const snapshot = await adminDb.collectionGroup("portfolio").get();
  const candidates: Array<DocumentReference<DocumentData>> = [];
  const protectedFieldCounts = new Map<string, number>();
  const removableFieldCounts = new Map<string, number>();
  const protectedPathSamples: string[] = [];
  let ignoredPaths = 0;
  let protectedDocuments = 0;
  let estimatedBytesBefore = 0;
  let estimatedBytesAfter = 0;

  for (const document of snapshot.docs) {
    if (!isUserPortfolioPath(document.ref.path)) {
      ignoredPaths += 1;
      continue;
    }

    const data = document.data() as Record<string, unknown>;
    const extraFields = getPortfolioExtraFields(data);
    const protectedFields = getProtectedPortfolioFields(data);
    for (const field of extraFields) {
      const counts = isKnownLegacyPortfolioCardField(field)
        ? removableFieldCounts
        : protectedFieldCounts;
      counts.set(field, (counts.get(field) ?? 0) + 1);
    }
    if (protectedFields.length > 0) {
      protectedDocuments += 1;
      if (protectedPathSamples.length < 10) {
        protectedPathSamples.push(redactPortfolioPath(document.ref.path));
      }
      continue;
    }

    const compact = compactPortfolioDocument(data);
    if (isPortfolioDocumentCompact(data, compact)) continue;

    candidates.push(document.ref);
    estimatedBytesBefore += approximateJsonBytes(data);
    estimatedBytesAfter += approximateJsonBytes(compact);
  }

  console.log(
    JSON.stringify({
      applyChanges,
      candidateDocuments: candidates.length,
      estimatedBytesAfter,
      estimatedBytesBefore,
      ignoredPaths,
      projectId: projectId ?? "unknown",
      protectedDocuments,
      protectedFieldCounts: Object.fromEntries(
        [...protectedFieldCounts].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      protectedPathSamples,
      removableFieldCounts: Object.fromEntries(
        [...removableFieldCounts].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      scannedDocuments: snapshot.size,
    }),
  );

  if (!applyChanges) {
    console.log(
      projectId
        ? `Dry run only. Export/backup Firestore first, then rerun with --apply --project=${projectId}. Documents with unknown fields will remain untouched.`
        : "Dry run only. The Firebase project ID is unknown, so apply mode is disabled. Set FIREBASE_PROJECT_ID before retrying.",
    );
    return;
  }

  let compacted = 0;
  for (const reference of candidates) {
    if (await compactCurrentDocument(reference)) {
      compacted += 1;
      if (compacted % 100 === 0) {
        console.log(`Compacted ${compacted}/${candidates.length} documents`);
      }
    }
  }

  console.log(
    `Portfolio compaction complete: ${compacted} legacy documents rewritten`,
  );
}

function isDirectRun(): boolean {
  const entryPath = process.argv[1];
  return Boolean(
    entryPath &&
      pathToFileURL(path.resolve(entryPath)).href === import.meta.url,
  );
}

if (isDirectRun()) {
  const applyChanges = process.argv.includes("--apply");
  const projectArgument = process.argv.find((argument) =>
    argument.startsWith("--project="),
  );
  const expectedProjectId = projectArgument?.slice("--project=".length);
  void compactLegacyPortfolioEntries(
    applyChanges,
    expectedProjectId,
  ).catch((error: unknown) => {
    logError("Portfolio compaction failed", error);
    process.exitCode = 1;
  });
}
