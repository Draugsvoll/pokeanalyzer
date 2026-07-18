import type { NextFunction, Request, Response } from "express";

export function attachRequestAbortSignal(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const controller = new AbortController();
  res.locals.requestAbortSignal = controller.signal;

  const cleanup = () => {
    req.removeListener("aborted", abort);
    res.removeListener("close", abort);
    res.removeListener("finish", cleanup);
  };
  const abort = () => {
    cleanup();
    controller.abort();
  };

  req.once("aborted", abort);
  res.once("close", abort);
  res.once("finish", cleanup);
  next();
}

export function getRequestAbortSignal(res: Response): AbortSignal {
  const signal = res.locals.requestAbortSignal;
  if (!(signal instanceof AbortSignal)) {
    throw new Error("Request abort signal is unavailable");
  }
  return signal;
}

export function isRequestAbort(error: unknown, signal: AbortSignal) {
  return signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError");
}
