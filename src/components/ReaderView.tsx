import { play } from "cuelume";
import { startTransition, useEffect, useRef, useState } from "react";
import { canReadInApp, itemMetaLine, type Item } from "../item";
import {
  ArticleExtractionError,
  extractArticle,
} from "../reader/extractArticle";
import { sanitizeArticleHtml } from "../reader/sanitizeArticle";

type ReaderViewProps = {
  item: Item;
  onClose: () => void;
};

type ReaderState =
  | { status: "loading" }
  | { status: "ready"; article: ReadyArticle }
  | { status: "error"; message: string };

type ReadyArticle = {
  title: string;
  author: string | null;
  sourceUrl: string;
  wordCount: number;
  html: string;
};

export function ReaderView({ item, onClose }: ReaderViewProps) {
  const [state, setState] = useState<ReaderState>({ status: "loading" });
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [item.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const itemType = item.type;
    const itemUrl = item.url;
    setState({ status: "loading" });

    async function loadArticle() {
      if (itemUrl === null || !canReadInApp({ type: itemType, url: itemUrl })) {
        setState({
          status: "error",
          message:
            itemUrl === null
              ? "This item does not have an original URL."
              : "Reader is only available for articles and papers.",
        });
        return;
      }

      try {
        const article = await extractArticle(itemUrl, controller.signal);
        const readyArticle: ReadyArticle = {
          title: article.title,
          author: article.author,
          sourceUrl: article.sourceUrl,
          wordCount: article.wordCount,
          html: sanitizeArticleHtml(article.html, article.sourceUrl),
        };

        if (controller.signal.aborted) {
          return;
        }

        play("ready");
        startTransition(() => {
          setState({ status: "ready", article: readyArticle });
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        play("error");
        setState({
          status: "error",
          message:
            error instanceof ArticleExtractionError
              ? error.message
              : "The page could not be opened. Please try the original link.",
        });
      }
    }

    void loadArticle();
    return () => controller.abort();
  }, [item.id, item.type, item.url]);

  const originalUrl = item.url;
  const title = state.status === "ready" ? state.article.title : item.title;
  const source = state.status === "ready" ? state.article.sourceUrl : originalUrl;

  return (
    <div className="reader-page">
      <header className="reader-header">
        <button
          type="button"
          className="reader-back"
          data-cuelume-press="page"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m15 5-7 7 7 7" />
          </svg>
          <span>Back</span>
        </button>
        {originalUrl !== null && (
          <a
            className="reader-original"
            href={originalUrl}
            target="_blank"
            rel="noreferrer"
            data-cuelume-press="page"
          >
            Open original
          </a>
        )}
      </header>
      <div className="reader-column">
        <p className="visually-hidden" role="status" aria-live="polite">
          {state.status === "loading" ? "Opening article." : ""}
        </p>
        <article className="reader-article" aria-busy={state.status === "loading"}>
          <header className="reader-title-block">
            <p className="reader-type">{itemMetaLine(item)}</p>
            <h1 ref={headingRef} tabIndex={-1} className="reader-title">
              {title}
            </h1>
            {state.status === "ready" && (
              <p className="reader-meta">
                {state.article.author !== null && `${state.article.author} · `}
                {formatReadingTime(state.article.wordCount)} · {formatWordCount(state.article.wordCount)}
              </p>
            )}
          </header>
          {state.status === "loading" && (
            <div className="reader-loading" role="status">
              <span>Opening article…</span>
            </div>
          )}
          {state.status === "error" && (
            <div className="reader-error" role="alert">
              <p>{state.message}</p>
              {originalUrl !== null && (
                <a href={originalUrl} target="_blank" rel="noreferrer">
                  Open the original link
                </a>
              )}
            </div>
          )}
          {state.status === "ready" && source !== null && (
            <>
              <p className="reader-source">
                Reading from <a href={source} target="_blank" rel="noreferrer">{new URL(source).hostname}</a>
              </p>
              <div
                className="reader-content"
                dangerouslySetInnerHTML={{ __html: state.article.html }}
              />
            </>
          )}
        </article>
      </div>
    </div>
  );
}

function formatReadingTime(wordCount: number): string {
  return `${Math.max(1, Math.ceil(wordCount / 200))} min read`;
}

function formatWordCount(wordCount: number): string {
  return `${wordCount.toLocaleString()} words`;
}
