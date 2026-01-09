import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/app/providers/AuthProvider";
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

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/" element={<AboutPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        {showDevRoutes ? <Route path="/__ui/skeletons" element={<SkeletonGalleryPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
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
  );
}






