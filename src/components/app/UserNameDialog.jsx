import { useEffect, useState } from "react"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUser } from "@/providers/UserProvider"

export function UserNameDialog({ open, onOpenChange }) {
  const { user, changeName } = useUser()
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Initialize fields from user
  useEffect(() => {
    if (!user || !open) return
    const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    setDisplayName(fullName)
    const emailName = user.email?.split("@")[0] || ""
    setUsername(emailName)
  }, [user, open])

  const handleSave = async () => {
    if (!user) return
    setError(null)
    setSubmitting(true)
    try {
      const parts = displayName.trim().split(" ")
      const firstName = parts[0] || ""
      const lastName = parts.slice(1).join(" ") || ""
      await changeName({ first_name: firstName, last_name: lastName })
      // SSE updates user; dialog closes via DialogClose below
      onOpenChange?.(false)
    } catch (err) {
      console.error("[UserNameDialog] changeName failed:", err)
      setError("Couldn't update your name. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    setError(null)
    onOpenChange?.(false)
  }

  const initials = user
    ? ((user.firstName?.[0] ?? user.email?.[0] ?? "?") + (user.lastName?.[0] ?? "")).toUpperCase()
    : "NB"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 border-border bg-card">
        <DialogHeader className="px-8 pt-8 pb-6">
          <DialogTitle className="text-2xl font-semibold text-foreground">Edit profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 px-8 pb-6">
          <button
            type="button"
            className="relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
            aria-label="Upload profile picture"
          >
            <Avatar className="h-32 w-32 border-2 border-border">
              <AvatarImage
                src={user?.avatarUrl || "/placeholder.svg"}
                alt={user ? `${user.firstName} ${user.lastName}` : "User avatar"}
              />
              <AvatarFallback className="bg-muted text-muted-foreground text-3xl font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-background border-2 border-border shadow-sm group-hover:bg-muted transition-colors">
              <Camera className="h-5 w-5 text-foreground" />
            </div>
          </button>
        </div>

        <div className="px-8 pb-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-sm font-medium text-foreground">
              Display name
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-11 text-base border-input bg-background focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium text-foreground">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-11 text-base border-input bg-background focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Your username"
            />
            {/* TODO: wire username to backend when you add that field */}
          </div>
        </div>

        <div className="px-8 pb-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your name and username are used in the NeuroBridge app.
          </p>
        </div>

        {error && (
          <div className="px-8 pb-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 px-8 py-6 border-t border-border bg-muted/30">
          <DialogClose asChild>
            <Button
              variant="outline"
              onClick={handleCancel}
              className="px-6 h-10 text-sm font-medium border-input hover:bg-accent hover:text-accent-foreground bg-transparent"
              disabled={submitting}
            >
              Cancel
            </Button>
          </DialogClose>

          <DialogClose asChild>
            <Button
              onClick={handleSave}
              className="px-6 h-10 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save"}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}










