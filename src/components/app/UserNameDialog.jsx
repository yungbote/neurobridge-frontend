import React, { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser } from "@/providers/UserProvider";

export function UserNameDialog({ open, onOpenChange }) {
  const { user, changeName } = useUser();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Initialize fields from user
  useEffect(() => {
    if (!user || !open) return;
    const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    setDisplayName(fullName);
    const emailName = user.email?.split("@")[0] || "";
    setUsername(emailName);
  }, [user, open]);

  const handleSave = async () => {
    if (!user) return;
    setError(null);
    setSubmitting(true);
    try {
      const parts = displayName.trim().split(" ");
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      await changeName({ first_name: firstName, last_name: lastName });
      // SSE updates user; dialog closes via DialogClose below
      onOpenChange?.(false);
    } catch (err) {
      console.error("[UserNameDialog] changeName failed:", err);
      setError("Couldn't update your name. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setError(null);
    onOpenChange?.(false);
  };

  const initials = user
    ? (
        (user.firstName?.[0] ?? user.email?.[0] ?? "?") +
        (user.lastName?.[0] ?? "")
      ).toUpperCase()
    : "NB";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-8">
        <DialogHeader>
          <DialogTitle className="text-3xl font-normal">Edit profile</DialogTitle>
        </DialogHeader>

        {/* Avatar section */}
        <div className="flex flex-col items-center gap-8 py-8">
          <Button className="default">
            <div className="relative">
              <Avatar className="h-48 w-48">
                <AvatarImage
                  src={user?.avatarUrl}
                  alt={
                    user
                      ? `${user.firstName} ${user.lastName}`
                      : "User avatar"
                  }
                />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute bottom-2 right-2 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
                <Camera className="h-6 w-6 text-gray-700" />
              </div>
            </div>
          </Button>
        </div>

        {/* Form Fields */}
        <div className="w-full space-y-6">
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-base font-normal">
              Display name
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-14 text-lg border-gray-300"
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-base font-normal">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-14 text-lg border-gray-300"
              placeholder="Your username"
            />
            {/* TODO: wire username to backend when you add that field */}
          </div>
        </div>

        {/* Helper Text */}
        <p className="text-center text-gray-500 text-base leading-relaxed">
          Your name and username are used in the NeuroBridge app.
        </p>

        {error && (
          <p className="text-sm text-destructive text-center">
            {error}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 w-full">
          <DialogClose asChild>
            <Button
              variant="outline"
              onClick={handleCancel}
              className="px-8 h-12 text-base rounded-full bg-transparent"
              disabled={submitting}
            >
              Cancel
            </Button>
          </DialogClose>

          <DialogClose asChild>
            <Button
              onClick={handleSave}
              className="px-10 h-12 text-base rounded-full bg-black hover:bg-gray-800"
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save"}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}










