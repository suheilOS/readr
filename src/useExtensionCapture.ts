import { useEffect } from "react";
import {
  isYouTubeCapturedContent,
  type YouTubeCapturedContent,
} from "../shared/media";
import type { CaptureInput, CaptureResult } from "../shared/capture";
import { parseItemUrl, type Item } from "../shared/item";
import { attachYouTubeContent } from "./itemApi";
import type { CaptureAttempt } from "./useItemLibrary";

type ExtensionCaptureOptions = {
  persistUrl: (input: CaptureInput) => Promise<CaptureAttempt>;
  reconcileItem: (item: Item) => void;
};

/** Connect the MV3 bridge to the app without exposing extension protocol details in App. */
export function useExtensionCapture({
  persistUrl,
  reconcileItem,
}: ExtensionCaptureOptions): void {
  useEffect(() => {
    function handleUrlCapture(event: MessageEvent<unknown>) {
      if (
        !isSameOriginMessage(event) ||
        !isExtensionUrlCaptureMessage(event.data)
      ) {
        return;
      }

      const capture = event.data;
      void persistUrl({ url: capture.url })
        .then(({ result, error }) => {
          postResult(
            capture.captureId,
            "readr:capture-url",
            result === null
              ? {
                  ok: false,
                  error: error?.message ?? "Readr could not save this page.",
                  code: error?.code ?? "capture_failed",
                }
              : { ok: true, result: publicCaptureResult(result) },
          );
        })
        .catch((error: unknown) => {
          postResult(capture.captureId, "readr:capture-url", {
            ok: false,
            error: error instanceof Error ? error.message : "Readr could not save this page.",
            code: "capture_failed",
          });
        });
    }

    window.addEventListener("message", handleUrlCapture);
    return () => window.removeEventListener("message", handleUrlCapture);
  }, [persistUrl]);

  useEffect(() => {
    function handleMediaAttachment(event: MessageEvent<unknown>) {
      if (
        !isSameOriginMessage(event) ||
        !isExtensionMediaMessage(event.data)
      ) {
        return;
      }

      const attachment = event.data;
      void attachYouTubeContent(attachment.itemId, attachment.content)
        .then(({ item }) => {
          reconcileItem(item);
          postResult(attachment.captureId, "readr:youtube-media", { ok: true });
        })
        .catch((error: unknown) => {
          console.warn(JSON.stringify({
            message: "Browser YouTube enrichment failed after URL capture",
            itemId: attachment.itemId,
            error: error instanceof Error ? error.message : String(error),
          }));
          postResult(attachment.captureId, "readr:youtube-media", { ok: false });
        });
    }

    window.addEventListener("message", handleMediaAttachment);
    window.postMessage({ type: "readr:capture-ready" }, window.location.origin);
    return () => window.removeEventListener("message", handleMediaAttachment);
  }, [reconcileItem]);
}

function postResult(
  captureId: string,
  resultType: "readr:capture-url" | "readr:youtube-media",
  result: { ok: true; result?: CaptureResultPublic } | { ok: false; error?: string; code?: string },
): void {
  window.postMessage({
    type: "readr:capture-result",
    resultType,
    captureId,
    ...result,
  }, window.location.origin);
}

type CaptureResultPublic = {
  item: Pick<Item, "id" | "title" | "status">;
  created: boolean;
};

function publicCaptureResult(result: CaptureResult): CaptureResultPublic {
  return {
    item: { id: result.item.id, title: result.item.title, status: result.item.status },
    created: result.created,
  };
}

function isSameOriginMessage(event: MessageEvent<unknown>): boolean {
  return event.source === window && event.origin === window.location.origin;
}

function isExtensionUrlCaptureMessage(value: unknown): value is {
  type: "readr:capture-url";
  captureId: string;
  url: string;
} {
  return isRecord(value) &&
    value.type === "readr:capture-url" &&
    isCaptureId(value.captureId) &&
    typeof value.url === "string" &&
    value.url.length <= 2_048 &&
    parseItemUrl(value.url) !== null;
}

function isExtensionMediaMessage(value: unknown): value is {
  type: "readr:youtube-media";
  captureId: string;
  itemId: string;
  content: YouTubeCapturedContent;
} {
  return isRecord(value) &&
    value.type === "readr:youtube-media" &&
    isCaptureId(value.captureId) &&
    typeof value.itemId === "string" &&
    value.itemId.length > 0 &&
    value.itemId.length <= 100 &&
    isYouTubeCapturedContent(value.content);
}

function isCaptureId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
