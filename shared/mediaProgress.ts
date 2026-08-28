export type MediaProgress = {
  positionSeconds: number;
  durationSeconds: number;
  revision: string;
  updatedAt: string;
};

export type SaveMediaProgressInput = Omit<MediaProgress, "updatedAt">;

export function parseSaveMediaProgressInput(value: unknown): SaveMediaProgressInput | null {
  if (!isRecord(value)) return null;
  return isProgressValues(value) ? {
    positionSeconds: value.positionSeconds,
    durationSeconds: value.durationSeconds,
    revision: value.revision,
  } : null;
}

export function isMediaProgress(value: unknown): value is MediaProgress {
  return isRecord(value) &&
    isProgressValues(value) &&
    typeof value.updatedAt === "string";
}

function isProgressValues(value: Record<string, unknown>): value is Record<string, unknown> & SaveMediaProgressInput {
  return isFiniteSeconds(value.positionSeconds) &&
    isFiniteSeconds(value.durationSeconds) &&
    value.durationSeconds > 0 &&
    value.durationSeconds <= 31 * 24 * 60 * 60 &&
    value.positionSeconds <= value.durationSeconds &&
    typeof value.revision === "string" &&
    /^\d{13}-[0-9a-f]{32}-\d{10}$/.test(value.revision);
}

function isFiniteSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
