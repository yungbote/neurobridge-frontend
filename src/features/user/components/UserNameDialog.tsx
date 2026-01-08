import { useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useI18n } from "@/app/providers/I18nProvider";
import { useUser } from "@/app/providers/UserProvider";
import { ColorPicker, AVATAR_COLORS } from "@/features/user/components/ColorPicker";

interface UserNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UserSnapshot = {
  displayName: string;
  avatarColor: string;
};

function splitDisplayName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { first: "", last: "" };
  const parts = trimmed.split(/\s+/);
  const first = parts.shift() ?? "";
  const last = parts.join(" ");
  return { first, last };
}

export function UserNameDialog({ open, onOpenChange }: UserNameDialogProps) {
  const { user, changeName, changeAvatarColor, uploadAvatar } = useUser();
  const { t } = useI18n();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // live-edit draft values (we still keep local control of the input)
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // snapshot of the persisted state at dialog open (used for revert)
  const snapshotRef = useRef<UserSnapshot | null>(null);

  // debounce timers for live saving
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // prevent infinite loops / spam
  const lastSentRef = useRef({ first: "", last: "", color: "" });
  const isOpenRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = open;
  }, [open]);

  // Initialize local state ON OPEN only (do not continuously overwrite while user types)
  useEffect(() => {
    if (!user || !open) return;

    const initialDisplayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    setDisplayName(initialDisplayName);

    const emailPrefix = user.email?.split("@")[0] ?? "";
    setUsername(emailPrefix);

    const savedColor = user.avatarColor ?? AVATAR_COLORS[0];
    setSelectedColor(savedColor);

    const snapshot: UserSnapshot = {
      displayName: initialDisplayName,
      avatarColor: savedColor,
    };
    snapshotRef.current = snapshot;

    const snapNames = splitDisplayName(initialDisplayName);
    lastSentRef.current = {
      first: snapNames.first,
      last: snapNames.last,
      color: snapshot.avatarColor,
    };

    setError(null);
  }, [user, open]);

  const { first: draftFirst, last: draftLast } = useMemo(
    () => splitDisplayName(displayName),
    [displayName]
  );

  const draftColor = selectedColor ?? (user?.avatarColor ?? AVATAR_COLORS[0]);

  // LIVE SAVE: name (debounced)
  useEffect(() => {
    if (!open) return;
    if (!snapshotRef.current) return;

    // Don’t send if empty (you can relax this if you want)
    if (!draftFirst || !draftLast) return;

    // If unchanged from last sent, do nothing
    if (draftFirst === lastSentRef.current.first && draftLast === lastSentRef.current.last) return;

    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(async () => {
      try {
        // Only run if still open
        if (!isOpenRef.current) return;

        await changeName({ first_name: draftFirst, last_name: draftLast });
        lastSentRef.current.first = draftFirst;
        lastSentRef.current.last = draftLast;
        // SSE will update the rest of the app (and avatarUrl)
      } catch (e) {
        console.error("[UserNameDialog] live changeName failed:", e);
        setError(t("user.profile.error.updateNameLive"));
      }
    }, 450);

    return () => {
      if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    };
  }, [draftFirst, draftLast, open, changeName, t]);

  // LIVE SAVE: color (debounced)
  useEffect(() => {
    if (!open) return;
    if (!snapshotRef.current) return;

    if (!draftColor) return;

    if (draftColor === lastSentRef.current.color) return;

    if (colorTimerRef.current) clearTimeout(colorTimerRef.current);
    colorTimerRef.current = setTimeout(async () => {
      try {
        if (!isOpenRef.current) return;

        await changeAvatarColor(draftColor);
        lastSentRef.current.color = draftColor;
        // SSE will update avatarUrl + avatarColor
      } catch (e) {
        console.error("[UserNameDialog] live changeAvatarColor failed:", e);
        setError(t("user.profile.error.updateAvatarColorLive"));
      }
    }, 250);

    return () => {
      if (colorTimerRef.current) clearTimeout(colorTimerRef.current);
    };
  }, [draftColor, open, changeAvatarColor, t]);

  const clearTimers = () => {
    if (nameTimerRef.current) {
      clearTimeout(nameTimerRef.current);
      nameTimerRef.current = null;
    }
    if (colorTimerRef.current) {
      clearTimeout(colorTimerRef.current);
      colorTimerRef.current = null;
    }
  };

  // Cancel MUST revert backend because we were live-saving
  const revertToSnapshot = async () => {
    const snap = snapshotRef.current;
    if (!snap) return;

    const snapNames = splitDisplayName(snap.displayName);
    const needNameRevert =
      lastSentRef.current.first !== snapNames.first || lastSentRef.current.last !== snapNames.last;
    const needColorRevert = lastSentRef.current.color !== snap.avatarColor;

    if (!needNameRevert && !needColorRevert) return;

    // Revert in parallel; backend will emit SSE events to sync everything back
    const tasks: Promise<unknown>[] = [];
    if (needNameRevert) {
      tasks.push(changeName({ first_name: snapNames.first, last_name: snapNames.last }));
    }
    if (needColorRevert) {
      tasks.push(changeAvatarColor(snap.avatarColor));
    }

    await Promise.allSettled(tasks);

    // Update lastSent to reflect snapshot so we don't re-fire effects if dialog reopens immediately
    lastSentRef.current = {
      first: snapNames.first,
      last: snapNames.last,
      color: snap.avatarColor,
    };
  };

  const handleCancel = async () => {
    setError(null);
    clearTimers();

    try {
      setSubmitting(true);
      await revertToSnapshot();
    } catch (e) {
      console.error("[UserNameDialog] revert failed:", e);
      // Even if revert fails, close — but you can choose to keep it open and show error
    } finally {
      setSubmitting(false);
      onOpenChange?.(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    // ESC / click-outside should behave like cancel (revert)
    if (!nextOpen) {
      // fire and forget, but keep UI responsive
      handleCancel();
      return;
    }
    onOpenChange?.(true);
  };

  // Optional: upload avatar (immediate persist). If you want cancel to revert uploads too,
  // you need to keep previous avatar_url and re-upload/regenerate on cancel — usually not worth it.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handlePickUpload = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSubmitting(true);
    try {
      await uploadAvatar(file);
      // SSE should update avatarUrl
    } catch (err) {
      console.error("[UserNameDialog] uploadAvatar failed:", err);
      setError(t("user.profile.error.uploadAvatar"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-border/60 sm:px-8 sm:pt-8 sm:pb-6">
          <DialogTitle className="text-2xl font-semibold text-foreground">{t("user.profile.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 px-6 pb-6 sm:px-8">
          <div className="relative group h-24 w-24 rounded-full sm:h-32 sm:w-32">
            <div className="h-24 w-24 rounded-full overflow-hidden border border-border/60 sm:h-32 sm:w-32">
              <img
                src={user.avatarUrl || "/placeholder.svg"}
                alt={t("user.profile.avatarAlt")}
                className="h-full w-full object-cover"
              />
            </div>

            {/* LIVE color picker (writes via SSE, cancel reverts) */}
            <ColorPicker
              value={draftColor}
              onChange={(c) => setSelectedColor(c)}
              position="top-right"
              radius={86}
              swatchSize={18}
            />

            {/* Upload */}
            <button
              type="button"
              className="absolute bottom-0 right-0 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/80 shadow-sm backdrop-blur-sm nb-motion-fast motion-reduce:transition-none group-hover:bg-muted/60"
              aria-label={t("user.profile.uploadPicture")}
              onClick={handlePickUpload}
              disabled={submitting}
            >
              <Camera className="h-5 w-5 text-foreground" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        <div className="px-6 pb-6 space-y-5 sm:px-8">
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-sm font-medium text-foreground">
              {t("user.profile.displayName.label")}
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-11 text-base border-input bg-background focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t("user.profile.displayName.placeholder")}
              autoCapitalize="words"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium text-foreground">
              {t("user.profile.username.label")}
            </Label>
            <Input
              id="username"
              value={username}
              className="h-11 text-base border-input bg-muted/30 text-muted-foreground"
              placeholder={t("user.profile.username.placeholder")}
              disabled
            />
          </div>
        </div>

        <div className="px-6 pb-6 sm:px-8">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("user.profile.helper.liveChanges")}
          </p>
        </div>

        {error && (
          <div className="px-6 pb-4 sm:px-8">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex flex-col-reverse justify-end gap-3 border-t border-border/60 bg-muted/20 px-6 py-5 sm:flex-row sm:px-8 sm:py-6">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="h-10 w-full px-6 text-sm font-medium border-input hover:bg-accent hover:text-accent-foreground bg-transparent sm:w-auto"
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>

          <Button
            onClick={() => onOpenChange?.(false)}
            className="h-10 w-full px-6 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
            disabled={submitting}
          >
            {t("common.done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
