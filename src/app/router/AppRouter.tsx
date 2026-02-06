import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/app/providers/AuthProvider";
import { recordRouteChange } from "@/shared/observability/rum";
import { RouteErrorBoundary } from "@/app/router/RouteErrorBoundary";
import AboutPage from "@/features/marketing/pages/AboutPage";
import FeaturesPage from "@/features/marketing/pages/FeaturesPage";
import PricingPage from "@/features/marketing/pages/PricingPage";
import HomePage from "@/features/home/pages/HomePage";
import FilesPage from "@/features/files/pages/FilesPage";
import PathsPage from "@/features/paths/pages/PathsPage";
import PathPage from "@/features/paths/pages/PathPage";
import PathNodePage from "@/features/paths/pages/PathNodePage";
import ActivityPage from "@/features/activity/pages/ActivityPage";
import PathBuildPage from "@/features/paths/pages/PathBuildPage";
import ChatThreadPage from "@/features/chat/pages/ChatThreadPage";
import SkeletonGalleryPage from "@/features/dev/pages/SkeletonGalleryPage";
export function AppRouter() {
  const { isAuthenticated } = useAuth();
  const showDevRoutes = import.meta.env.DEV;
  const location = useLocation();

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    const start = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    let raf1 = 0;
    let raf2 = 0;
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          const end = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
          recordRouteChange(path, Math.max(0, end - start));
        });
      });
    } else {
      recordRouteChange(path, 0);
    }
    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [location.pathname, location.search]);

  if (!isAuthenticated) {
    return (
      <RouteErrorBoundary path={`${location.pathname}${location.search}`}>
        <Routes>
          <Route path="/" element={<AboutPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          {showDevRoutes ? <Route path="/__ui/skeletons" element={<SkeletonGalleryPage />} /> : null}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RouteErrorBoundary>
    );
  }

  return (
    <RouteErrorBoundary path={`${location.pathname}${location.search}`}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/paths" element={<PathsPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/paths/build/:jobId" element={<PathBuildPage />} />
        <Route path="/chat/threads/:id" element={<ChatThreadPage />} />
        <Route path="/paths/:id" element={<PathPage />} />
        <Route path="/path-nodes/:id" element={<PathNodePage />} />
        <Route path="/activities/:id" element={<ActivityPage />} />
        {showDevRoutes ? <Route path="/__ui/skeletons" element={<SkeletonGalleryPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouteErrorBoundary>
  );
}




