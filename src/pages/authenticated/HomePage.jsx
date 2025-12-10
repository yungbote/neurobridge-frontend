import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();

  if (!isAuthenticated || userLoading || !user) {
    return null;
  }

  const firstName =
    user.firstName && user.firstName.length > 0
      ? user.firstName.charAt(0).toUpperCase() + user.firstName.slice(1)
      : user.email;

  return (
    <div className="flex flex-col gap-10 items-center py-10">
      {/* Hero copy */}
      <div className="flex flex-col gap-3 items-center text-center">
        <h1 className="font-brand text-5xl font-bold text-foreground">
          Welcome, {firstName}.
        </h1>
        <p className="font-medium text-foreground/80 max-w-xl">
          Your workspace is ready. We&apos;ll keep adapting your resources and
          recommendations as you learn.
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="in-progress" className="w-full max-w-3xl">
        {/* THIS is the stable bar */}
        <TabsList className="grid w-full grid-cols-4 rounded-2xl bg-muted/60 p-1 min-h-[44px]">
          <TabsTrigger
            value="in-progress"
            className="rounded-xl data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            In Progress
          </TabsTrigger>
          <TabsTrigger
            value="saved"
            className="rounded-xl data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Saved
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="rounded-xl data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Completed
          </TabsTrigger>
          <TabsTrigger
            value="recent"
            className="rounded-xl data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Recent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in-progress" className="mt-6">
          <div className="rounded-2xl border border-border/60 bg-background/80 p-6">
            <p className="text-sm text-muted-foreground">
              You don&apos;t have anything in progress yet. Once you start
              working through resources, they&apos;ll appear here.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="saved" className="mt-6">
          <div className="rounded-2xl border border-border/60 bg-background/80 p-6">
            <p className="text-sm text-muted-foreground">
              Saved resources will show up here so you can get back to them
              quickly.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <div className="rounded-2xl border border-border/60 bg-background/80 p-6">
            <p className="text-sm text-muted-foreground">
              When you finish lessons or activities, they&apos;ll be listed
              here.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="recent" className="mt-6">
          <div className="rounded-2xl border border-border/60 bg-background/80 p-6">
            <p className="text-sm text-muted-foreground">
              Recently viewed items will show up here so you can quickly pick up
              where you left off.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}










