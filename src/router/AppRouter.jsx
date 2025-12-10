import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import AboutPage from "@/pages/nonauthenticated/AboutPage";
import FeaturesPage from "@/pages/nonauthenticated/FeaturesPage";
import PricingPage from "@/pages/nonauthenticated/PricingPage";
import HomePage from "@/pages/authenticated/HomePage";

export function AppRouter() {
  const { isAuthenticated } = useAuth();
  {/* About, Features, Pricing */}
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
  {/* Private Routes (authenticated) */}
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}










