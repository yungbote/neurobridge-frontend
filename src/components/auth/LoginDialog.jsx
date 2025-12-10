import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginDialog({ className, triggerLabel = "Login", onSwitchToSignup, ...props }) {
  const { login } = useAuth();
  const { reload } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      console.error("[LoginDialog] Login failed:", err);
      setError("Login failed. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLoginWithApple() {
    // TODO: hook into Apple OAuth flow
    console.log("Login with Apple clicked");
  }

  function handleLoginWithGoogle() {
    // TODO: hook into Google OAuth flow
    console.log("Login with Google clicked");
  }

  return (
    <Dialog {...props}>
      <DialogTrigger asChild>
        <Button variant="default" className="rounded-3xl">{triggerLabel}</Button>
      </DialogTrigger>

      <DialogContent className={cn("max-w-md rounded-3xl", className)}>
        {/*<DialogHeader className="text-center">
          <DialogTitle className="text-xl">Welcome back</DialogTitle>
          <DialogDescription>
            Login with your Apple or Google account, or use your email and password.
          </DialogDescription>
        </DialogHeader>*/}

        <div className="flex flex-col gap-6">
          <Card className="bg-transparent border-none shadow-none">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>Login with your Apple or Google Account </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit}>
                <FieldGroup>
                  <Field>
                    <Button variant="outline" type="button" onClick={handleLoginWithApple} className="w-full justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                      fill="currentColor"
                    />
                  </svg>
                      Login with Apple
                    </Button>

                    <Button variant="outline" type="button" onClick={handleLoginWithGoogle} className="w-full justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                          fill="currentColor"
                        />
                      </svg>
                      Login with Google
                    </Button>
                  </Field>

                  <FieldSeparator className="*:data-[slot=field-separator-content]:bg-transparent">
                    Or continue with
                  </FieldSeparator>

                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input id="email" type="email" placeholder="me@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
                  </Field>
                  <Field>
                    <div className="flex items-center">
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <a href="#" className="ml-auto text-sm underline-offset-4 hover:underline">
                        Forgot your password?
                      </a>
                    </div>
                    <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} />
                  </Field>

                  <Field>
                    <Button type="submit" disabled={submitting} className="w-full">
                      {submitting ? "Logging in..." : "Login"}
                    </Button>
                    <FieldDescription className="mt-2 text-center">
                      Don&apos;t have an account ?{" "}
                      <button type="button" className="underline underline-offset-4" onClick={() => { onSwitchToSignup?.(); }}>
                        Sign up
                      </button>
                    </FieldDescription>
                  </Field>
                  { error && (
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
            By clicking continue, you agree to our{" "}
            <a href="#" className="underline underline-offset-4">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-4">
              Privacy Policy
            </a>
            .
          </FieldDescription>
        </div>
      </DialogContent>
    </Dialog>
  );
}
