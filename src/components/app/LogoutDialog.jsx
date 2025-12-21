import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";

export function LogoutDialog({ open, onOpenChange }) {
  const { logout } = useAuth();
  const { user } = useUser();

  const handleLogout = async () => {
    await logout();           // calls /logout (best effort) + clearSession()
    onOpenChange?.(false);    // close dialog
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg gap-6 rounded-3xl p-6 sm:max-w-2xl sm:gap-8 sm:p-12">
        <DialogHeader className="space-y-3 text-center sm:space-y-4">
          <DialogTitle className="text-balance text-2xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Are you sure you want to log out?
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground sm:text-xl">
            Log out{user?.email ? ` as ${user.email}` : ""}?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Button
            onClick={handleLogout}
            className="h-12 rounded-full text-base font-medium sm:h-16 sm:text-xl"
            size="lg"
          >
            Log out
          </Button>
          <Button
            onClick={() => onOpenChange?.(false)}
            variant="outline"
            className="h-12 rounded-full text-base font-medium sm:h-16 sm:text-xl"
            size="lg"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}









