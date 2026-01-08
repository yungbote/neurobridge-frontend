import React, { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/app/providers/AuthProvider";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/shared/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { useI18n } from "@/app/providers/I18nProvider";

function splitName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return { first_name: "", last_name: "" };
  const parts = trimmed.split(" ");
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: "" };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
}

interface SignupDialogProps extends React.ComponentPropsWithoutRef<typeof Dialog> {
  className?: string;
  triggerLabel?: string;
  onSwitchToLogin?: () => void;
}

export function SignupDialog({
  className,
  triggerLabel,
  onSwitchToLogin,
  ...props
}: SignupDialogProps) {
  const { register, loginWithApple, loginWithGoogle } = useAuth();
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedTriggerLabel = triggerLabel ?? t("auth.signup");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(t("auth.signup.error.passwordMismatch"));
      return;
    }
    const { first_name, last_name } = splitName(fullName);
    setSubmitting(true);
    try {
      await register({
        email, password, first_name, last_name, 
      });
    } catch (err) {
      console.error("[SignupDialog] Signup failed:", err);
      setError(t("auth.signup.error.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignupWithApple() {
    setSubmitting(true);
    setError(null);
    try {
      await loginWithApple();
    } catch (err) {
      console.error("[SignupDialog] Apple signup/login failed:", err);
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg
          ? t("auth.apple.error.withMessage", { msg })
          : t("auth.apple.error.signup")
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignupWithGoogle() {
    setSubmitting(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error("[SignupDialog] Google signup/login failed:", err);
      const msg = err instanceof Error ? err.message : "";
      const origin = window.location.origin;
      setError(
        msg
          ? t("auth.google.error.withMessage", { msg, origin })
          : t("auth.google.error.signup")
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog {...props}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-3xl">{resolvedTriggerLabel}</Button>
      </DialogTrigger>

      <DialogContent className={cn("max-w-md", className)}>
        <div className="flex flex-col gap-6">
          <Card className="bg-transparent border-none shadow-none">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">{t("auth.signup.title")}</CardTitle>
              <CardDescription>
                {t("auth.signup.subtitle")}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              <form onSubmit={handleSubmit}>
                <FieldGroup>
                  <Field>
                    <Button variant="outline" type="button" onClick={handleSignupWithApple} disabled={submitting} className="w-full justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path
                          d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                      fill="currentColor"
                        />
                      </svg>
                      {t("auth.signup.withApple")}
                    </Button>

                    <Button variant="outline" type="button" onClick={handleSignupWithGoogle} disabled={submitting} className="w-full justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                          fill="currentColor"
                        />
                      </svg>
                      {t("auth.signup.withGoogle")}
                    </Button>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="fullName">{t("auth.fullName")}</FieldLabel>
                    <Input id="fullName" type="text" placeholder={t("auth.fullName.placeholder")} required value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={submitting} />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
                    <Input id="email" type="email" placeholder={t("auth.email.placeholder")} required value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
                  </Field>

                  <Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
                        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="confirm-password">{t("auth.confirmPassword")}</FieldLabel>
                        <Input id="confirm-password" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={submitting} />
                      </Field>
                    </div>
                    <FieldDescription>{t("auth.password.requirements")}</FieldDescription>
                  </Field>

                  <Field>
                    <Button type="submit" disabled={submitting} className="w-full">
                      {submitting ? t("auth.signup.submitting") : t("auth.signup.action")}
                    </Button>
                    <FieldDescription className="mt-2 text-center">
                      {t("auth.signup.haveAccount")}{" "}
                      <button type="button" className="underline underline-offset-4" onClick={() => { onSwitchToLogin?.(); }}>
                        {t("auth.signin")}
                      </button>
                    </FieldDescription>
                  </Field>

                  {error && (
                    <Field>
                      <FieldDescription className="text-center text-sm text-destructive">
                        {error}
                      </FieldDescription>
                    </Field>
                  )}
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          <FieldDescription className="px-6 text-center text-xs">
            {t("auth.legal.prefix")}{" "}
            <a href="#" className="underline underline-offset-4">
              {t("auth.legal.terms")}
            </a>{" "}
            {t("auth.legal.and")}{" "}
            <a href="#" className="underline underline-offset-4">
              {t("auth.legal.privacy")}
            </a>
            .
          </FieldDescription>
        </div>
      </DialogContent>
    </Dialog>
  );
}


