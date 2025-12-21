import React, { useMemo } from "react";
import { Link, useLocation, matchPath } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { usePaths } from "@/providers/PathProvider";

function getMeta(path) {
  const m = path?.metadata;
  if (!m) return {};
  if (typeof m === "object") return m;
  if (typeof m === "string") {
    try { return JSON.parse(m); } catch { return {}; }
  }
  return {};
}

function clampLabel(s, n = 42) {
  const str = String(s || "").trim();
  if (!str) return "";
  if (str.length <= n) return str;
  return str.slice(0, n - 1).trimEnd() + "…";
}

export function Breadcrumbs() {
  const location = useLocation();
  const { getById } = usePaths();

  const crumbs = useMemo(() => {
    const path = location.pathname;

    const out = [{ label: "Home", to: "/" }];

    if (path === "/") return out.map((c, i) => ({ ...c, current: i === out.length - 1 }));

    const pathMatch = matchPath({ path: "/paths/:id", end: true }, path);
    if (pathMatch?.params?.id) {
      const row = getById(pathMatch.params.id);
      const meta = getMeta(row);

      // ✅ prefer short_title / title over long_title
      const name =
        meta.short_title ||
        meta.shortTitle ||
        row?.title ||
        "Path";

      out.push({
        label: clampLabel(name, 42), // ✅ keep breadcrumb compact
        to: path,
      });

      return out.map((c, i) => ({ ...c, current: i === out.length - 1 }));
    }

    out.push({ label: "Page", to: path });
    return out.map((c, i) => ({ ...c, current: i === out.length - 1 }));
  }, [location.pathname, getById]);

  if (!crumbs || crumbs.length <= 1) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <React.Fragment key={`${c.to}-${idx}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="max-w-[420px] truncate">
                    {c.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    {/* ✅ no underline */}
                    <Link
                      to={c.to}
                      className="no-underline hover:no-underline hover:text-foreground transition-colors"
                    >
                      {c.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}









