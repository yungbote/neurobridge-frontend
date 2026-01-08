import type { TextDirection } from "@/shared/i18n/rtl";

type RtlScrollType = "negative" | "positive-ascending" | "positive-descending";

let cached: RtlScrollType | null = null;

function detectRtlScrollType(): RtlScrollType {
  if (typeof document === "undefined") return "positive-ascending";

  const el = document.createElement("div");
  el.dir = "rtl";
  el.style.width = "100px";
  el.style.height = "100px";
  el.style.overflow = "scroll";
  el.style.position = "absolute";
  el.style.top = "-9999px";
  el.style.visibility = "hidden";

  const inner = document.createElement("div");
  inner.style.width = "200px";
  inner.style.height = "100px";
  el.appendChild(inner);
  document.body.appendChild(el);

  // When dir=rtl:
  // - some engines start at max scrollLeft (positive-descending)
  // - others start at 0 and go negative (negative)
  // - others start at 0 and go positive (positive-ascending)
  const initial = el.scrollLeft;

  let type: RtlScrollType;
  if (initial > 0) {
    type = "positive-descending";
  } else {
    el.scrollLeft = -1;
    type = el.scrollLeft < 0 ? "negative" : "positive-ascending";
  }

  document.body.removeChild(el);
  return type;
}

function rtlType(): RtlScrollType {
  if (cached) return cached;
  cached = detectRtlScrollType();
  return cached;
}

export function maxScrollLeft(el: HTMLElement): number {
  return Math.max(0, el.scrollWidth - el.clientWidth);
}

export function getNormalizedScrollLeft(el: HTMLElement, dir: TextDirection): number {
  if (dir !== "rtl") return el.scrollLeft;
  const max = maxScrollLeft(el);
  const raw = el.scrollLeft;
  const type = rtlType();
  if (type === "negative") return -raw;
  if (type === "positive-descending") return max - raw;
  return raw; // positive-ascending
}

export function setNormalizedScrollLeft(el: HTMLElement, dir: TextDirection, value: number) {
  const max = maxScrollLeft(el);
  const clamped = Math.max(0, Math.min(max, value));
  if (dir !== "rtl") {
    el.scrollLeft = clamped;
    return;
  }

  const type = rtlType();
  if (type === "negative") {
    el.scrollLeft = -clamped;
    return;
  }
  if (type === "positive-descending") {
    el.scrollLeft = max - clamped;
    return;
  }
  el.scrollLeft = clamped; // positive-ascending
}

export function scrollToNormalized(
  el: HTMLElement,
  dir: TextDirection,
  value: number,
  behavior: ScrollBehavior
) {
  const max = maxScrollLeft(el);
  const clamped = Math.max(0, Math.min(max, value));
  if (dir !== "rtl") {
    el.scrollTo({ left: clamped, behavior });
    return;
  }
  const type = rtlType();
  if (type === "negative") {
    el.scrollTo({ left: -clamped, behavior });
    return;
  }
  if (type === "positive-descending") {
    el.scrollTo({ left: max - clamped, behavior });
    return;
  }
  el.scrollTo({ left: clamped, behavior });
}

