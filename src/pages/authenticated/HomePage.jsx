import React from "react";
import { HomeTabs } from "@/components/app/HomeTabs";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";
import { useCourses } from "@/providers/CourseProvider";

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();
  const { courses, loading: coursesLoading } = useCourses(); // you can use this later instead of dummy tabData

  if (!isAuthenticated || userLoading || !user) {
    return null;
  }

  const firstName =
    user.firstName && user.firstName.length > 0
      ? user.firstName.charAt(0).toUpperCase() + user.firstName.slice(1)
      : user.email;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-6 pt-16 pb-16 flex flex-col gap-12">
        {/* Hero */}
        <div className="flex flex-col gap-3 items-center text-center">
          <h1 className="font-brand text-5xl font-bold text-foreground">
            Welcome, {firstName}.
          </h1>
          <p className="font-medium text-foreground/80 max-w-xl">
            Your workspace is ready. We&apos;ll keep adapting your resources and
            recommendations as you learn.
          </p>
        </div>

        {/* Tabs + cards */}
        <HomeTabs />
      </main>
    </div>
  );
}










