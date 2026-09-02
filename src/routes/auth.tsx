import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import wttiLogo from "@/assets/wtti-logo.jpg";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — WTTI SWMS" },
      { name: "description", content: "Sign in or register for the WTTI Scheme of Work Management System." },
      { property: "og:title", content: "Sign in — WTTI SWMS" },
      { property: "og:description", content: "Access WTTI academic document submission and review workflows." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z.string().min(6, "Password must be at least 6 characters").max(128);

function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Link to="/" className="flex items-center gap-3">
          <img src={wttiLogo} alt="WTTI" className="h-10 w-auto rounded-md bg-white object-contain p-0.5" />
          <div>
            <div className="text-sm font-semibold">Wote Technical Training Institute</div>
            <div className="text-[11px] uppercase tracking-wider opacity-80">Scheme of Work Management</div>
          </div>
        </Link>
        <div>
          <h2 className="text-3xl font-bold">Empowering academic excellence through digital workflow.</h2>
          <p className="mt-4 max-w-md opacity-80">Submit, review, and approve academic planning documents with confidence, transparency and quality assurance.</p>
        </div>
        <div className="text-xs opacity-75">© {new Date().getFullYear()} WTTI</div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md border-border">
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to manage your academic documents.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="signin"><SignInForm /></TabsContent>
              <TabsContent value="signup"><SignUpForm /></TabsContent>
            </Tabs>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">← Back to homepage</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SignInForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Signed in");
    navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={handle} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in
      </Button>
    </form>
  );
}

function SignUpForm() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    try {
      z.string().trim().min(2, "Name required").max(100).parse(fullName);
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. You can sign in now.");
    navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={handle} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email2">Email</Label>
        <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password2">Password</Label>
        <Input id="password2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">New accounts start with the Trainer role. An administrator can grant additional roles.</p>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create account
      </Button>
    </form>
  );
}
