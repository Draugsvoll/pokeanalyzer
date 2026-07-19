export type TimestampLike =
  | string
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
    }
  | null
  | undefined;

export function getTimestampMillis(value: TimestampLike): number {
  if (!value) return 0;

  if (typeof value === "string") {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  return 0;
}

export function formatTimestampDate(value: TimestampLike): string {
  const time = getTimestampMillis(value);
  return time
    ? new Date(time).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "N/A";
}

export function formatTimestampDateTime(value: TimestampLike): string {
  const time = getTimestampMillis(value);
  return time ? new Date(time).toLocaleString() : "N/A";
}

export function formatTimestampString(value: TimestampLike): string {
  const time = getTimestampMillis(value);
  return time ? new Date(time).toString() : "N/A";
}
