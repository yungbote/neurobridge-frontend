import React, { useEffect, useMemo, useRef, useState } from "react";

import { getConceptGraph } from "@/api/PathService";
import { cn } from "@/lib/utils";

function safeParseJSON(v) {
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

function normalizeStringArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((s) => s.trim());
  const obj = safeParseJSON(v);
  if (Array.isArray(obj)) return obj.map((x) => String(x)).filter((s) => s.trim());
  return [];
}

function getAliases(concept) {
  const meta = safeParseJSON(concept?.metadata) || {};
  return normalizeStringArray(meta?.aliases);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function worldFromScreen(pt, view) {
  const s = view.scale || 1;
  return {
    x: (pt.x - view.offsetX) / s,
    y: (pt.y - view.offsetY) / s,
  };
}

function screenFromWorld(pt, view) {
  const s = view.scale || 1;
  return {
    x: view.offsetX + pt.x * s,
    y: view.offsetY + pt.y * s,
  };
}

export function ConceptGraphView({ pathId }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const viewRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });

  const rafRef = useRef(null);
  const pointerRef = useRef({
    mode: null, // "drag_node" | "pan" | null
    nodeId: null,
    downAt: null,
    nodeOffset: { x: 0, y: 0 },
    panStart: { x: 0, y: 0, offsetX: 0, offsetY: 0 },
    moved: false,
  });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

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
        if (mounted) setErr(e);
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
    const map = new Map();
    for (const c of concepts || []) {
      if (c?.id) map.set(c.id, c);
    }
    return map;
  }, [concepts]);

  const selected = selectedId ? conceptById.get(selectedId) : null;

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

    const degrees = new Map();
    for (const e of edges || []) {
      if (e?.fromConceptId) degrees.set(e.fromConceptId, (degrees.get(e.fromConceptId) || 0) + 1);
      if (e?.toConceptId) degrees.set(e.toConceptId, (degrees.get(e.toConceptId) || 0) + 1);
    }

    const nodes = (concepts || []).map((c, i) => {
      const label = c?.name || c?.key || "Concept";
      const deg = degrees.get(c.id) || 0;
      const radius = clamp(14 + Math.min(14, deg * 2), 14, 30);
      const angle = (i / Math.max(1, concepts.length)) * Math.PI * 2;
      const r = Math.min(w, h) * 0.25;
      return {
        id: c.id,
        label,
        x: Math.cos(angle) * r + (Math.random() - 0.5) * 20,
        y: Math.sin(angle) * r + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        radius,
        fixed: false,
      };
    });

    const idxById = new Map(nodes.map((n, idx) => [n.id, idx]));
    const springEdges = (edges || [])
      .map((e) => {
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
      .filter(Boolean);

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

    const getCanvasPoint = (evt) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
      };
    };

    const findNodeAt = (screenPt) => {
      const v = viewRef.current;
      const wpt = worldFromScreen(screenPt, v);
      let best = null;
      let bestD2 = Infinity;
      for (const n of nodesRef.current || []) {
        const dx = wpt.x - n.x;
        const dy = wpt.y - n.y;
        const d2 = dx * dx + dy * dy;
        const r = (n.radius || 16) * 1.25;
        if (d2 <= r * r && d2 < bestD2) {
          best = n;
          bestD2 = d2;
        }
      }
      return best;
    };

    const onPointerDown = (evt) => {
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

    const onPointerMove = (evt) => {
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

    const onPointerUp = (evt) => {
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

    const onWheel = (evt) => {
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

      // --- forces ---
      const repulsion = 5200;
      const springLen = 160;
      const springK = 0.012;
      const damping = 0.86;

      // repulsion O(n^2) - fine for small graphs
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy + 0.01;
          const dist = Math.sqrt(dist2);
          const force = repulsion / dist2;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!a.fixed) {
            a.vx += fx;
            a.vy += fy;
          }
          if (!b.fixed) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }

      // springs
      for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = springLen;
        const k = springK * clamp(e.strength || 1, 0.25, 3);
        const delta = dist - target;
        const fx = (dx / dist) * delta * k;
        const fy = (dy / dist) * delta * k;
        if (!a.fixed) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!b.fixed) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // integrate
      for (const n of nodes) {
        if (n.fixed) continue;
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx * 0.016;
        n.y += n.vy * 0.016;

        // soft bounds
        const boundX = w * 0.85;
        const boundY = h * 0.85;
        if (n.x < -boundX) n.x = -boundX;
        if (n.x > boundX) n.x = boundX;
        if (n.y < -boundY) n.y = -boundY;
        if (n.y > boundY) n.y = boundY;
      }

      // --- draw ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const isDark = document.documentElement.classList.contains("dark");

      // edges
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        if (!a || !b) continue;
        const sa = screenFromWorld(a, view);
        const sb = screenFromWorld(b, view);
        ctx.strokeStyle = isDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.22)";
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
      }

      // nodes
      for (const n of nodes) {
        const s = screenFromWorld(n, view);
        const isSelected = n.id === selectedId;
        const r = (n.radius || 16) * (view.scale || 1);

        ctx.fillStyle = isSelected
          ? "rgba(99,102,241,0.18)"
          : isDark
            ? "rgba(100,116,139,0.16)"
            : "rgba(15,23,42,0.06)";
        ctx.strokeStyle = isSelected
          ? "rgba(99,102,241,0.9)"
          : isDark
            ? "rgba(148,163,184,0.55)"
            : "rgba(100,116,139,0.4)";
        ctx.lineWidth = isSelected ? 2 : 1;

        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isDark ? "rgba(226,232,240,0.92)" : "rgba(15,23,42,0.92)";
        ctx.font = `${12 * (view.scale || 1)}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = String(n.label || "").trim();
        const short = label.length > 22 ? label.slice(0, 21).trimEnd() + "…" : label;
        ctx.fillText(short, s.x, s.y);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [selectedId]);

  const keyPoints = useMemo(() => normalizeStringArray(selected?.keyPoints), [selected]);
  const aliases = useMemo(() => getAliases(selected), [selected]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Drag nodes · Drag background to pan · Scroll to zoom
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
            "relative h-[380px] overflow-hidden rounded-xl border border-border bg-card sm:h-[480px] lg:h-[560px]"
          )}
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Loading concept graph…
            </div>
          ) : null}
          {!loading && concepts.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No concepts yet.
            </div>
          ) : null}
          <canvas ref={canvasRef} className="h-full w-full touch-none" />
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
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
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
