import { startTransition, useEffect, useRef, useState } from "react";
import { canReadInApp, itemMetaLine, readerKindFor, type Item } from "../../shared/item";
import type { ExtractedArticle } from "../../shared/extraction";
import { ArticleExtractionError } from "../reader/fetchArticleContent";
import type { ArticleCache } from "../reader/articleCache";
import { ArrowLeftIcon } from "./icons";
import { Spinner } from "./Spinner";
import { YouTubeReader } from "../reader/YouTubeReader";
import { notify } from "../notifications";
import "../reader/reader.css";

type ReaderViewProps = {
  item: Item;
  onClose: () => void;
  articleCache: ArticleCache;
};

type ReaderState =
  | { status: "loading" }
  | { status: "ready"; article: ExtractedArticle }
  | { status: "error"; message: string };

export function ReaderView({ item, onClose, articleCache }: ReaderViewProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (readerKindFor(item) === "youtube") {
    return (
      <div className="reader-page media-reader-page">
        <ReaderHeader item={item} onClose={onClose} />
        <div className="media-reader-column">
          <YouTubeReader item={item} />
        </div>
      </div>
    );
  }

  return <ArticleReader key={`${item.id}:${item.type}:${item.url}`} item={item} onClose={onClose} articleCache={articleCache} />;
}

function ArticleReader({ item, onClose, articleCache }: ReaderViewProps) {
  const [state, setState] = useState<ReaderState>(() => {
    const article = articleCache.peek(item);
    return article === null ? { status: "loading" } : { status: "ready", article };
  });
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [item.id]);

  useEffect(() => {
    // ArticleReader is keyed by identity: its initializer owns the loading or
    // cached state. Cleanup only ignores results; the cache owns cancellation.
    let disposed = false;
    const itemType = item.type;
    const itemUrl = item.url;

    async function loadArticle() {
      if (itemUrl === null || !canReadInApp({ type: itemType, url: itemUrl })) {
        setState({
          status: "error",
          message:
            itemUrl === null
              ? "This item does not have an original URL."
              : "This item can’t be opened in Readr.",
        });
        return;
      }

      try {
        const readyArticle = await articleCache.load({ id: item.id, type: itemType, url: itemUrl });

        if (disposed) {
          return;
        }

        startTransition(() => {
          setState({ status: "ready", article: readyArticle });
        });
      } catch (error) {
        if (disposed) {
          return;
        }

        const message =
          error instanceof ArticleExtractionError
            ? error.message
            : "The page could not be opened. Please try the original link.";
        notify({ message, state: "error", sound: "error" });
        setState({ status: "error", message });
      }
    }

    void loadArticle();
    return () => { disposed = true; };
  }, [item.id, item.type, item.url, articleCache]);

  const originalUrl = item.url;
  const title = state.status === "ready" ? state.article.title : item.title;
  const source = state.status === "ready" ? state.article.sourceUrl : originalUrl;

  return (
    <div className="reader-page">
      <ReaderHeader item={item} onClose={onClose} />
      <div className="reader-column">
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
            <div className="reader-loading">
              <Spinner label="Opening article" />
              <span aria-hidden="true">Opening article…</span>
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

function ReaderHeader({ item, onClose }: Pick<ReaderViewProps, "item" | "onClose">) {
  return (
    <header className="reader-header">
      <button type="button" className="reader-back" onClick={onClose}>
        <ArrowLeftIcon />
        <span>Back</span>
      </button>
      {item.url !== null && (
        <a className="reader-original" href={item.url} target="_blank" rel="noreferrer">
          Open original
        </a>
      )}
    </header>
  );
}

function formatReadingTime(wordCount: number): string {
  return `${Math.max(1, Math.ceil(wordCount / 200))} min read`;
}

function formatWordCount(wordCount: number): string {
  return `${wordCount.toLocaleString()} words`;
}
