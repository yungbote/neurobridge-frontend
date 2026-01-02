import React, { useState } from "react";
import { NavigationTabs } from "@/features/home/components/NavigationTabs";
import { HomeTabContent } from "@/features/home/components/HomeTabContent";
import { AnimatedChatbar } from "@/features/chat/components/AnimatedChatbar";
import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { Clock, Bookmark, CheckCircle2, History } from "lucide-react";
import { Container } from "@/shared/layout/Container";
import type { HomeTabKey } from "@/features/home/components/HomeTabContent";

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();

  const { paths, loading: pathsLoading } = usePaths();

  const [activeTab, setActiveTab] = useState<HomeTabKey>("home");

  if (!isAuthenticated || userLoading || !user) {
    return null;
  }

  const handleSubmit = (message: string) => {
    console.log("Submitted:", message);
  }

  const firstName =
    user.firstName && user.firstName.length > 0
      ? user.firstName.charAt(0).toUpperCase() + user.firstName.slice(1)
      : user.email;

  const tabs: { id: HomeTabKey; label: string; icon?: React.ReactNode }[] = [
    { id: "home", label: "Home" },
    { id: "in-progress", label: "In Progress", icon: <Clock className="size-5" /> },
    { id: "saved", label: "Saved", icon: <Bookmark className="size-5" /> },
    { id: "completed", label: "Completed", icon: <CheckCircle2 className="size-5" /> },
    { id: "recently-viewed", label: "Recently Viewed", icon: <History className="size-5" /> },
  ];

  return (
    <div className="page-surface">
      <Container className="page-pad">
        <div className="flex flex-col gap-3 items-center text-center">
          <h1 className="font-brand text-balance break-words text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Welcome, {firstName}.
          </h1>
          <p className="max-w-xl text-pretty text-base font-medium text-foreground/80 sm:text-lg">
            Your workspace is ready. We&apos;ll keep adapting your resources and
            recommendations as you learn.
          </p>
        </div>
      </Container>

      <div className="page-pad-compact">
        <AnimatedChatbar onSubmit={handleSubmit} respectReducedMotion={false} />
      </div>

      <NavigationTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <Container className="page-pad">
        <HomeTabContent
          activeTab={activeTab}
          paths={paths || []}
          loading={pathsLoading}
        />
      </Container>
    </div>
  );
}







