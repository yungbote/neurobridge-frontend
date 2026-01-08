import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { useAuth } from "@/app/providers/AuthProvider";
import { useI18n } from "@/app/providers/I18nProvider";
import { useUser } from "@/app/providers/UserProvider";

interface LogoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LogoutDialog({ open, onOpenChange }: LogoutDialogProps) {
  const { logout } = useAuth();
  const { user } = useUser();
  const { t } = useI18n();

  const handleLogout = async () => {
    await logout();           // calls /logout (best effort) + clearSession()
    onOpenChange?.(false);    // close dialog
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-5 rounded-2xl p-6 sm:p-8">
        <DialogHeader className="space-y-2 text-center sm:text-start">
          <DialogTitle className="text-balance text-2xl font-semibold tracking-tight">
            {t("auth.logout.title")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {user?.email ? t("auth.logout.description.withEmail", { email: user.email }) : t("auth.logout.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Button
            onClick={handleLogout}
            className="h-11 rounded-xl text-sm font-medium"
            size="lg"
          >
            {t("user.logout")}
          </Button>
          <Button
            onClick={() => onOpenChange?.(false)}
            variant="outline"
            className="h-11 rounded-xl text-sm font-medium"
            size="lg"
          >
            {t("common.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}





