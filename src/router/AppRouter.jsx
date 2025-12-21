import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import AboutPage from "@/pages/nonauthenticated/AboutPage";
import FeaturesPage from "@/pages/nonauthenticated/FeaturesPage";
import PricingPage from "@/pages/nonauthenticated/PricingPage";
import HomePage from "@/pages/authenticated/HomePage";
import PathPage from "@/pages/authenticated/PathPage";
import ActivityPage from "@/pages/authenticated/ActivityPage";

export function AppRouter() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/" element={<AboutPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/paths/:id" element={<PathPage />} />
      <Route path="/activities/:id" element={<ActivityPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}







