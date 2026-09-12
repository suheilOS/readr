import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  calculateSplitBounds,
  clampPlayerWidth,
  DEFAULT_PLAYER_RATIO,
  MIN_PLAYER_WIDTH,
  MIN_TRANSCRIPT_WIDTH,
  SPLITTER_WIDTH,
  type SplitBounds,
} from "./mediaSplitGeometry";

const KEYBOARD_STEP = 16;
const LARGE_KEYBOARD_STEP = 64;

type MediaTranscriptSplitProps = {
  player: ReactNode;
  playerPaneId: string;
  transcript: ReactNode;
  transcriptPaneId: string;
};


type DragState = {
  pointerId: number;
  startClientX: number;
  startPlayerWidth: number;
  direction: 1 | -1;
};

type SplitLayoutStyle = CSSProperties & {
  "--media-player-width": string;
  "--media-player-min-width": string;
  "--media-transcript-min-width": string;
  "--media-splitter-width": string;
};

export function MediaTranscriptSplit({
  player,
  playerPaneId,
  transcript,
  transcriptPaneId,
}: MediaTranscriptSplitProps) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const splitterRef = useRef<HTMLDivElement>(null);
  const instructionsId = useId();
  const preferredRatioRef = useRef(DEFAULT_PLAYER_RATIO);
  const playerWidthRef = useRef(0);
  const boundsRef = useRef<SplitBounds | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [splitValue, setSplitValue] = useState({
    now: Math.round(DEFAULT_PLAYER_RATIO * 100),
    min: 0,
    max: 100,
  });
  const [isDragging, setIsDragging] = useState(false);

  const applyPreferredRatio = useCallback(() => {
    const layout = layoutRef.current;
    if (layout === null) return;

    const bounds = calculateSplitBounds(layout.getBoundingClientRect().width);
    boundsRef.current = bounds;
    const playerWidth = clampPlayerWidth(
      preferredRatioRef.current * bounds.availableWidth,
      bounds,
    );
    applyPlayerWidth(layout, playerWidth);
    playerWidthRef.current = playerWidth;
    setSplitValue(toSplitValue(playerWidth, bounds));
  }, []);

  useEffect(() => {
    const layout = layoutRef.current;
    if (layout === null) return;

    applyPreferredRatio();
    const observer = new ResizeObserver(applyPreferredRatio);
    observer.observe(layout);
    return () => observer.disconnect();
  }, [applyPreferredRatio]);

  function commitPlayerWidth(playerWidth: number) {
    const bounds = boundsRef.current;
    if (bounds === null) return;

    const clampedWidth = clampPlayerWidth(playerWidth, bounds);
    const layout = layoutRef.current;
    if (layout !== null) applyPlayerWidth(layout, clampedWidth);
    playerWidthRef.current = clampedWidth;
    preferredRatioRef.current = clampedWidth / bounds.availableWidth;
    setSplitValue(toSplitValue(clampedWidth, bounds));
  }

  function finishDragging() {
    if (dragRef.current === null) return;
    dragRef.current = null;
    setIsDragging(false);
    commitPlayerWidth(playerWidthRef.current);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const bounds = boundsRef.current;
    if (bounds === null || bounds.maxPlayerWidth <= bounds.minPlayerWidth) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startPlayerWidth: playerWidthRef.current,
      direction: getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1,
    };
    setIsDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const bounds = boundsRef.current;
    const layout = layoutRef.current;
    if (drag === null || bounds === null || layout === null || drag.pointerId !== event.pointerId) return;

    const requestedWidth = drag.startPlayerWidth + ((event.clientX - drag.startClientX) * drag.direction);
    const playerWidth = clampPlayerWidth(requestedWidth, bounds);
    applyPlayerWidth(layout, playerWidth);
    applyAriaValue(splitterRef.current, toSplitValue(playerWidth, bounds));
    playerWidthRef.current = playerWidth;
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishDragging();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const bounds = boundsRef.current;
    if (bounds === null) return;

    const direction = getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1;
    const step = event.shiftKey ? LARGE_KEYBOARD_STEP : KEYBOARD_STEP;
    let nextWidth: number | null = null;

    if (event.key === "ArrowLeft") nextWidth = playerWidthRef.current - (step * direction);
    else if (event.key === "ArrowRight") nextWidth = playerWidthRef.current + (step * direction);
    else if (event.key === "Home") nextWidth = bounds.minPlayerWidth;
    else if (event.key === "End") nextWidth = bounds.maxPlayerWidth;
    else if (event.key === "Enter") nextWidth = DEFAULT_PLAYER_RATIO * bounds.availableWidth;

    if (nextWidth === null) return;
    event.preventDefault();
    event.stopPropagation();
    commitPlayerWidth(nextWidth);
  }

  const style: SplitLayoutStyle = {
    "--media-player-width": `${DEFAULT_PLAYER_RATIO * 100}%`,
    "--media-player-min-width": `${MIN_PLAYER_WIDTH}px`,
    "--media-transcript-min-width": `${MIN_TRANSCRIPT_WIDTH}px`,
    "--media-splitter-width": `${SPLITTER_WIDTH}px`,
  };

  return (
    <div
      ref={layoutRef}
      className="media-reader-layout"
      data-resizing={isDragging ? "" : undefined}
      style={style}
    >
      {player}
      <div
        ref={splitterRef}
        className="media-splitter"
        role="separator"
        tabIndex={0}
        aria-label="Resize video and transcript"
        aria-orientation="vertical"
        aria-controls={`${playerPaneId} ${transcriptPaneId}`}
        aria-valuemin={splitValue.min}
        aria-valuemax={splitValue.max}
        aria-valuenow={splitValue.now}
        aria-valuetext={`Video ${splitValue.now}%, transcript ${100 - splitValue.now}%`}
        aria-describedby={instructionsId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={finishDragging}
        onKeyDown={handleKeyDown}
      >
        <span className="media-splitter-grip" aria-hidden="true" />
      </div>
      {transcript}
      <span id={instructionsId} className="visually-hidden">
        Use the left and right arrow keys to resize. Hold Shift for a larger step. Press Enter to reset.
      </span>
      {isDragging && <div className="media-resize-shield" aria-hidden="true" />}
    </div>
  );
}


function applyPlayerWidth(layout: HTMLDivElement, playerWidth: number) {
  layout.style.setProperty("--media-player-width", `${playerWidth}px`);
}

function toPercent(playerWidth: number, availableWidth: number): number {
  return Math.round((playerWidth / availableWidth) * 100);
}

function toSplitValue(playerWidth: number, bounds: SplitBounds) {
  return {
    now: toPercent(playerWidth, bounds.availableWidth),
    min: toPercent(bounds.minPlayerWidth, bounds.availableWidth),
    max: toPercent(bounds.maxPlayerWidth, bounds.availableWidth),
  };
}

function applyAriaValue(splitter: HTMLDivElement | null, value: ReturnType<typeof toSplitValue>) {
  if (splitter === null) return;
  splitter.setAttribute("aria-valuenow", String(value.now));
  splitter.setAttribute("aria-valuetext", `Video ${value.now}%, transcript ${100 - value.now}%`);
}
