// Swipe a sliding panel back the way it came in. The panel follows the finger and closes once
// dragged far (or flung fast) enough; otherwise it springs back. Touch only.

/** Horizontal travel before a touch counts as a swipe rather than a tap or a scroll. */
const SLOP = 10;
/** Fraction of the panel's width that closes it on release. */
const CLOSE_AT = 0.3;
/** px cap on that distance, so a wide tablet sidebar doesn't need a long drag. */
const CLOSE_MAX = 90;
/** px/ms; a quick flick closes the panel however short. */
const FLING = 0.4;

export interface SwipeOptions {
  /** Which way the panel closes: 1 to the right (the panel sits on the right), -1 to the left. */
  dir: 1 | -1;
  onclose: () => void;
}

export function swipeClose(node: HTMLElement, options: SwipeOptions) {
  let opts = options;
  let id = -1;
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let dragging = false;
  let moved = false;
  let offset = 0;

  const reset = (): void => {
    id = -1;
    dragging = false;
  };

  function down(e: PointerEvent): void {
    if (e.pointerType !== "touch" || !e.isPrimary) return;
    id = e.pointerId;
    x0 = e.clientX;
    y0 = e.clientY;
    t0 = e.timeStamp;
    moved = false;
  }

  function move(e: PointerEvent): void {
    if (e.pointerId !== id) return;
    const dx = (e.clientX - x0) * opts.dir;
    if (!dragging) {
      if (dx > SLOP && dx > Math.abs(e.clientY - y0) * 1.5) {
        dragging = true;
        node.setPointerCapture(id);
        node.style.transition = "none";
      } else return;
    }
    offset = Math.max(0, dx);
    node.style.transform = `translateX(${offset * opts.dir}px)`;
  }

  function up(e: PointerEvent): void {
    if (e.pointerId !== id) return;
    const was = dragging;
    reset();
    if (!was) return;
    moved = true;
    const fast = offset / Math.max(1, e.timeStamp - t0) > FLING;
    const far = offset > Math.min(node.offsetWidth * CLOSE_AT, CLOSE_MAX);
    const close = e.type === "pointerup" && (fast || far);
    // Handing the transform back to the stylesheet makes the panel finish the move on its own.
    node.style.transition = "";
    node.style.transform = "";
    if (close) opts.onclose();
  }

  // The lift that ends a swipe would otherwise click whatever row it ended on.
  function click(e: MouseEvent): void {
    if (!moved) return;
    moved = false;
    e.stopPropagation();
    e.preventDefault();
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", up);
  node.addEventListener("click", click, true);

  return {
    update(next: SwipeOptions): void {
      opts = next;
    },
    destroy(): void {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      node.removeEventListener("click", click, true);
    },
  };
}
