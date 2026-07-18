import type { NextFunction, Request, RequestHandler, Response } from "express";
import { adminAuth } from "../subscriptions/firebaseAdmin.js";

export class AuthHttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AuthHttpError";
    this.statusCode = statusCode;
  }
}

export async function getVerifiedUid(req: Request) {
  const authHeader = req.header("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    throw new AuthHttpError("Missing auth token", 401);
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token, true);
  } catch {
    throw new AuthHttpError("Invalid or expired auth token", 401);
  }

  if (decodedToken.email_verified !== true) {
    throw new AuthHttpError("Verify your email before using this feature", 403);
  }

  return decodedToken.uid;
}

export const requireVerifiedUser: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.locals.authUid = await getVerifiedUid(req);
    next();
  } catch (error) {
    const statusCode = error instanceof AuthHttpError ? error.statusCode : 401;
    const message = error instanceof AuthHttpError ? error.message : "Authentication failed";
    res.status(statusCode).json({ message });
  }
};

export function getAuthenticatedUid(res: Response) {
  const uid: unknown = res.locals.authUid;
  if (typeof uid !== "string" || !uid) {
    throw new AuthHttpError("Authentication failed", 401);
  }
  return uid;
}
