import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getConceptGraph } from "@/shared/api/PathService";
import { cn } from "@/shared/lib/utils";
import { Skeleton, SkeletonText } from "@/shared/ui/skeleton";
import type { Concept, ConceptEdge } from "@/shared/types/models";

type Point = { x: number; y: number };

interface ViewState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface GraphNode {
  id: string;
  label: string;
  parentId: string | null;
  sortIndex: number;
  depth: number;
  leafCount: number;
  width: number;
  height: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  fixed: boolean;
  children: GraphNode[];
}

interface SpringEdge {
  a: number;
  b: number;
  type: string;
  strength: number;
}

interface PointerState {
  mode: "drag_node" | "pan" | null;
  nodeId: string | null;
  downAt: (Point & { t: number }) | null;
  nodeOffset: Point;
  panStart: { x: number; y: number; offsetX: number; offsetY: number };
  moved: boolean;
}

interface ConceptGraphViewProps {
  pathId?: string | null;
}

function getErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function safeParseJSON(v: unknown) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((s) => s.trim());
  const obj = safeParseJSON(v);
  if (Array.isArray(obj)) return obj.map((x) => String(x)).filter((s) => s.trim());
  return [];
}

function getAliases(concept: Concept | null | undefined) {
  const metaRaw = safeParseJSON(concept?.metadata);
  const meta = metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
    ? (metaRaw as Record<string, unknown>)
    : null;
  return normalizeStringArray(meta?.aliases);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function polarToCartesian(angle: number, radius: number): Point {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function computeNodeSize(label: string) {
  const base = 72;
  const width = clamp(base + String(label || "").length * 7, 90, 220);
  return { width, height: 34 };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}

function sortChildren(children: GraphNode[]) {
  return (children || []).slice().sort((a, b) => {
    const ai = typeof a.sortIndex === "number" ? a.sortIndex : 0;
    const bi = typeof b.sortIndex === "number" ? b.sortIndex : 0;
    if (ai !== bi) return ai - bi;
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
}

function worldFromScreen(pt: Point, view: ViewState): Point {
  const s = view.scale || 1;
  return {
    x: (pt.x - view.offsetX) / s,
    y: (pt.y - view.offsetY) / s,
  };
}

function screenFromWorld(pt: Point, view: ViewState): Point {
  const s = view.scale || 1;
  return {
    x: view.offsetX + pt.x * s,
    y: view.offsetY + pt.y * s,
  };
}

export function ConceptGraphViewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-72 rounded-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div
          className={cn(
            "relative h-[380px] overflow-hidden rounded-2xl border border-border bg-card sm:h-[480px] lg:h-[560px]"
          )}
        >
          <div className="absolute inset-0 p-4">
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-card p-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-7 w-10/12 rounded-full" />
              <Skeleton className="h-4 w-7/12 rounded-full" />
            </div>
            <SkeletonText lines={5} />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <Skeleton key={i} className="h-6 w-16 rounded-full" />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ConceptGraphView({ pathId }: ConceptGraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<SpringEdge[]>([]);
  const viewRef = useRef<ViewState>({ offsetX: 0, offsetY: 0, scale: 1 });

  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef<PointerState>({
    mode: null, // "drag_node" | "pan" | null
    nodeId: null,
    downAt: null,
    nodeOffset: { x: 0, y: 0 },
    panStart: { x: 0, y: 0, offsetX: 0, offsetY: 0 },
    moved: false,
  });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [edges, setEdges] = useState<ConceptEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!pathId) return;
      try {
        setLoading(true);
        setErr(null);
        const res = await getConceptGraph(pathId);
        if (!mounted) return;
        setConcepts(res.concepts || []);
        setEdges(res.edges || []);
      } catch (e) {
        console.error("[ConceptGraphView] load failed:", e);
        if (mounted) setErr(getErrorMessage(e, "Failed to load concept graph."));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [pathId]);

  const conceptById = useMemo(() => {
    const map = new Map<string, Concept>();
    for (const c of concepts || []) {
      if (c?.id) map.set(c.id, c);
    }
    return map;
  }, [concepts]);

  const selected = selectedId ? conceptById.get(selectedId) : null;

  if (loading && !err && concepts.length === 0) {
    return <ConceptGraphViewSkeleton />;
  }

  // Build graph simulation data when concepts/edges change
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 540;

    viewRef.current = {
      offsetX: w / 2,
      offsetY: h / 2,
      scale: 1,
    };

    const nodeMap = new Map<string, GraphNode>();
    const nodes: GraphNode[] = (concepts || []).map((c) => {
      const label = c?.name || c?.key || "Concept";
      const size = computeNodeSize(label);
      const node = {
        id: String(c.id || ""),
        label,
        parentId: c?.parentId ?? null,
        sortIndex: typeof c?.sortIndex === "number" ? c.sortIndex : 0,
        depth: 0,
        leafCount: 1,
        width: size.width,
        height: size.height,
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
        vx: 0,
        vy: 0,
        fixed: false,
        children: [],
      };
      if (node.id) nodeMap.set(node.id, node);
      return node;
    });

    const roots: GraphNode[] = [];
    nodes.forEach((n) => {
      const parent = n.parentId ? nodeMap.get(n.parentId) : null;
      if (parent) parent.children.push(n);
      else roots.push(n);
    });

    const computeLeaves = (node: GraphNode) => {
      const kids = node.children || [];
      if (!kids.length) {
        node.leafCount = 1;
        return 1;
      }
      const count = kids.reduce((sum, child) => sum + computeLeaves(child), 0);
      node.leafCount = Math.max(1, count);
      return node.leafCount;
    };
    roots.forEach((r) => computeLeaves(r));

    const ring = Math.min(w, h) * 0.26;
    const rootRing = roots.length > 1 ? 1 : 0;
    const totalLeaves = roots.reduce((sum, r) => sum + (r.leafCount || 1), 0) || 1;

    const layoutChildren = (node: GraphNode, startAngle: number, endAngle: number, depth: number) => {
      const kids = sortChildren(node.children);
      if (!kids.length) return;
      const total = kids.reduce((sum, k) => sum + (k.leafCount || 1), 0) || 1;
      let cursor = startAngle;
      for (const child of kids) {
        const span = ((endAngle - startAngle) * (child.leafCount || 1)) / total;
        const mid = cursor + span / 2;
        const pos = polarToCartesian(mid, ring * depth);
        child.depth = depth;
        child.tx = pos.x;
        child.ty = pos.y;
        child.x = pos.x;
        child.y = pos.y;
        layoutChildren(child, cursor, cursor + span, depth + 1);
        cursor += span;
      }
    };

    let angleCursor = -Math.PI / 2;
    roots.forEach((root) => {
      const span = (root.leafCount || 1) / totalLeaves * Math.PI * 2;
      const mid = angleCursor + span / 2;
      const pos = polarToCartesian(mid, ring * rootRing);
      root.depth = rootRing;
      root.tx = pos.x;
      root.ty = pos.y;
      root.x = pos.x;
      root.y = pos.y;
      layoutChildren(root, angleCursor, angleCursor + span, rootRing + 1);
      angleCursor += span;
    });

    const idxById = new Map(nodes.map((n, idx) => [n.id, idx] as const));
    const springEdges: SpringEdge[] = (edges || [])
      .map((e) => {
        if (!e.fromConceptId || !e.toConceptId) return null;
        const a = idxById.get(e.fromConceptId);
        const b = idxById.get(e.toConceptId);
        if (a == null || b == null) return null;
        return {
          a,
          b,
          type: e.edgeType || "rel",
          strength: typeof e.strength === "number" ? e.strength : 1,
        };
      })
      .filter((edge): edge is SpringEdge => Boolean(edge));

    nodesRef.current = nodes;
    edgesRef.current = springEdges;

    if (!selectedId && nodes.length > 0) {
      setSelectedId(nodes[0].id);
    }
  }, [concepts, edges, selectedId]);

  // Keep canvas sized to container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 540;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const v = viewRef.current;
      // keep center stable-ish on resize
      if (typeof v.offsetX !== "number" || typeof v.offsetY !== "number") {
        viewRef.current.offsetX = w / 2;
        viewRef.current.offsetY = h / 2;
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Pointer + wheel interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const getCanvasPoint = (evt: PointerEvent | WheelEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
      };
    };

    const findNodeAt = (screenPt: Point): GraphNode | null => {
      const v = viewRef.current;
      const wpt = worldFromScreen(screenPt, v);
      let best = null;
      let bestD2 = Infinity;
      for (const n of nodesRef.current || []) {
        const halfW = (n.width || 120) * 0.6;
        const halfH = (n.height || 34) * 0.65;
        const dx = Math.abs(wpt.x - n.x);
        const dy = Math.abs(wpt.y - n.y);
        if (dx <= halfW && dy <= halfH) {
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            best = n;
            bestD2 = d2;
          }
        }
      }
      return best;
    };

    const onPointerDown = (evt: PointerEvent) => {
      evt.preventDefault();
      canvas.setPointerCapture?.(evt.pointerId);

      const pt = getCanvasPoint(evt);
      const node = findNodeAt(pt);

      pointerRef.current = {
        mode: node ? "drag_node" : "pan",
        nodeId: node?.id || null,
        downAt: { x: pt.x, y: pt.y, t: Date.now() },
        nodeOffset: node
          ? (() => {
              const wpt = worldFromScreen(pt, viewRef.current);
              return { x: wpt.x - node.x, y: wpt.y - node.y };
            })()
          : { x: 0, y: 0 },
        panStart: {
          x: pt.x,
          y: pt.y,
          offsetX: viewRef.current.offsetX,
          offsetY: viewRef.current.offsetY,
        },
        moved: false,
      };

      if (node) {
        setSelectedId(node.id);
        node.fixed = true;
      }
    };

    const onPointerMove = (evt: PointerEvent) => {
      const pr = pointerRef.current;
      if (!pr?.mode) return;

      const pt = getCanvasPoint(evt);
      if (pr.downAt) {
        const dx = pt.x - pr.downAt.x;
        const dy = pt.y - pr.downAt.y;
        if (dx * dx + dy * dy > 4) pr.moved = true;
      }

      if (pr.mode === "drag_node" && pr.nodeId) {
        const node = (nodesRef.current || []).find((n) => n.id === pr.nodeId);
        if (!node) return;
        const wpt = worldFromScreen(pt, viewRef.current);
        node.x = wpt.x - pr.nodeOffset.x;
        node.y = wpt.y - pr.nodeOffset.y;
        node.tx = node.x;
        node.ty = node.y;
        node.vx = 0;
        node.vy = 0;
        return;
      }

      if (pr.mode === "pan") {
        const dx = pt.x - pr.panStart.x;
        const dy = pt.y - pr.panStart.y;
        viewRef.current.offsetX = pr.panStart.offsetX + dx;
        viewRef.current.offsetY = pr.panStart.offsetY + dy;
      }
    };

    const onPointerUp = (evt: PointerEvent) => {
      const pr = pointerRef.current;
      if (!pr?.mode) return;

      const pt = getCanvasPoint(evt);

      if (pr.mode === "drag_node" && pr.nodeId) {
        const node = (nodesRef.current || []).find((n) => n.id === pr.nodeId);
        if (node) node.fixed = false;
      }

      // click select if pointer didn't move much
      if (!pr.moved) {
        const node = findNodeAt(pt);
        if (node) setSelectedId(node.id);
      }

      pointerRef.current.mode = null;
      pointerRef.current.nodeId = null;
    };

    const onWheel = (evt: WheelEvent) => {
      // zoom around cursor
      evt.preventDefault();
      const delta = evt.deltaY;
      const zoom = Math.exp(-delta * 0.0015);
      const v = viewRef.current;
      const pt = getCanvasPoint(evt);
      const before = worldFromScreen(pt, v);

      const nextScale = clamp((v.scale || 1) * zoom, 0.35, 2.5);
      v.scale = nextScale;

      const after = worldFromScreen(pt, v);
      // adjust pan so the point under cursor stays fixed
      v.offsetX += (after.x - before.x) * v.scale;
      v.offsetY += (after.y - before.y) * v.scale;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Simulation + drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tick = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      const nodes = nodesRef.current || [];
      const edges = edgesRef.current || [];
      const view = viewRef.current;

      // Ease nodes toward their layout targets for a calm mindmap feel.
      const ease = 0.12;
      for (const n of nodes) {
        if (n.fixed) continue;
        n.x += (n.tx - n.x) * ease;
        n.y += (n.ty - n.y) * ease;
      }

      // --- draw ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const isDark = document.documentElement.classList.contains("dark");

      // edges
      for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        if (!a || !b) continue;
        const sa = screenFromWorld(a, view);
        const sb = screenFromWorld(b, view);
        const dx = sb.x - sa.x;
        const dy = sb.y - sa.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const offset = Math.min(60, dist * 0.2);
        const nx = -dy / dist;
        const ny = dx / dist;
        const cx = (sa.x + sb.x) / 2 + nx * offset;
        const cy = (sa.y + sb.y) / 2 + ny * offset;

        ctx.strokeStyle = isDark ? "rgba(148,163,184,0.35)" : "rgba(71,85,105,0.25)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.quadraticCurveTo(cx, cy, sb.x, sb.y);
        ctx.stroke();
      }

      // nodes
      const palette = [
        { light: "hsla(188, 72%, 92%, 0.95)", dark: "hsla(188, 40%, 22%, 0.95)" },
        { light: "hsla(160, 60%, 92%, 0.95)", dark: "hsla(160, 35%, 22%, 0.95)" },
        { light: "hsla(44, 80%, 92%, 0.95)", dark: "hsla(44, 45%, 22%, 0.95)" },
        { light: "hsla(24, 85%, 92%, 0.95)", dark: "hsla(24, 45%, 22%, 0.95)" },
      ];

      for (const n of nodes) {
        const s = screenFromWorld(n, view);
        const isSelected = n.id === selectedId;
        const scale = view.scale || 1;
        const width = (n.width || 120) * scale;
        const height = (n.height || 34) * scale;
        const r = Math.min(18 * scale, height / 2);
        const depthIdx = Math.max(0, Math.min(palette.length - 1, n.depth || 0));
        const fill = isDark ? palette[depthIdx].dark : palette[depthIdx].light;
        const stroke = isSelected
          ? "rgba(14,116,144,0.95)"
          : isDark
            ? "rgba(148,163,184,0.6)"
            : "rgba(71,85,105,0.35)";

        ctx.save();
        ctx.shadowColor = isSelected
          ? "rgba(14,116,144,0.35)"
          : isDark
            ? "rgba(15,23,42,0.4)"
            : "rgba(15,23,42,0.12)";
        ctx.shadowBlur = isSelected ? 18 : 12;
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = isSelected ? 2 : 1.2;

        const x = s.x - width / 2;
        const y = s.y - height / 2;
        ctx.beginPath();
        drawRoundedRect(ctx, x, y, width, height, r);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        const fontSize = clamp(11 * scale, 9, 16);
        ctx.fillStyle = isDark ? "rgba(226,232,240,0.95)" : "rgba(15,23,42,0.92)";
        ctx.font = `600 ${fontSize}px Riforma, ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = String(n.label || "").trim();
        const maxChars = width < 120 ? 12 : width < 160 ? 16 : 22;
        const short = label.length > maxChars ? label.slice(0, maxChars - 1).trimEnd() + "…" : label;
        ctx.fillText(short, s.x, s.y);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [selectedId]);

  const keyPoints = useMemo(() => normalizeStringArray(selected?.keyPoints), [selected]);
  const aliases = useMemo(() => getAliases(selected), [selected]);

  const resetView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 540;
    viewRef.current = { offsetX: w / 2, offsetY: h / 2, scale: 1 };
  }, []);

  const centerOnSelected = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const node = (nodesRef.current || []).find((n) => n.id === selectedId);
    if (!node) return;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 540;
    const v = viewRef.current;
    viewRef.current = {
      ...v,
      offsetX: w / 2 - node.x * (v.scale || 1),
      offsetY: h / 2 - node.y * (v.scale || 1),
    };
  }, [selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Drag nodes · Drag background to pan · Scroll to zoom
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={centerOnSelected}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Center
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Reset
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Failed to load concept graph.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div
          ref={containerRef}
          className={cn(
            "relative h-[380px] overflow-hidden rounded-2xl border border-border bg-card sm:h-[480px] lg:h-[560px]"
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_#e0f2fe_0%,_transparent_55%)] opacity-60" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,_rgba(148,163,184,0.25)_1px,_transparent_1px)] [background-size:24px_24px] opacity-30" />
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Skeleton className="h-4 w-40 rounded-full" />
            </div>
          ) : null}
          {!loading && concepts.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No concepts yet.
            </div>
          ) : null}
          <canvas ref={canvasRef} className="relative h-full w-full touch-none" />
        </div>

        <aside className="rounded-xl border border-border bg-card p-4">
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Concept
                </div>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {selected.name || selected.key}
                </h3>
                {selected.key ? (
                  <div className="mt-1 text-xs text-muted-foreground">{selected.key}</div>
                ) : null}
              </div>

              {selected.summary ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {selected.summary}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              )}

              {aliases.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Aliases
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aliases.map((a) => (
                      <span
                        key={a}
                        className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {keyPoints.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Key points
                  </div>
                  <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                    {keyPoints.slice(0, 8).map((kp) => (
                      <li key={kp}>{kp}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a node to view notes.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
