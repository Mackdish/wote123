import type { ReactNode, ComponentType } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { ShieldCheck, FileCheck2, Workflow, BarChart3, Bell, Lock, ArrowRight, Mail, Phone, MapPin, Megaphone, Images } from "lucide-react";
import { listPublicNotices } from "@/lib/api/notices.functions";
import { listPublicHomepageImages } from "@/lib/api/settings.functions";
import wttiLogo from "@/assets/wtti-logo.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WTTI SWMS — Scheme of Work Management System" },
      { name: "description", content: "Wote Technical Training Institute's digital platform for academic document submission, review and quality assurance." },
      { property: "og:title", content: "WTTI Scheme of Work Management System" },
      { property: "og:description", content: "Submit, review and approve Schemes of Work, Session Plans, Records of Work and Training Programs." },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: FileCheck2, title: "Digital Submissions", desc: "Upload schemes of work, session plans, records of work and training programs in one place." },
  { icon: Workflow, title: "Multi-Stage Approval", desc: "Trainer → HOD → Internal Quality Assurance → Deputy Principal, with full audit trail." },
  { icon: ShieldCheck, title: "Quality Assurance", desc: "Compliance verification, curriculum alignment checks and quality recommendations." },
  { icon: BarChart3, title: "Reports & Analytics", desc: "Submission trends, approval timelines and department performance dashboards." },
  { icon: Bell, title: "Real-Time Notifications", desc: "Stay informed at every approval, rejection or correction request." },
  { icon: Lock, title: "Role-Based Security", desc: "Granular access for trainers, HODs, IQA officers, Deputy Principal and administrators." },
];

const WORKFLOW_STEPS = [
  { n: 1, t: "Trainer submits", d: "Upload document with all academic metadata." },
  { n: 2, t: "HOD reviews", d: "Approve and forward, or return with comments." },
  { n: 3, t: "IQA checks compliance", d: "Curriculum alignment and quality assurance." },
  { n: 4, t: "Deputy Principal approves", d: "Final approval and archiving." },
];

const ANNOUNCEMENTS = [
  "📢 Term 2 schemes of work submission deadline: extended by one week",
  "🎓 IQA training workshop for all Heads of Department next Friday",
  "✅ New: download approved documents directly from your dashboard",
  "📝 Trainers — remember to attach session plans for every week",
];

function useHomepageImages() {
  const fetchImages = useServerFn(listPublicHomepageImages);
  return useQuery({
    queryKey: ["public-homepage-images"],
    queryFn: () => fetchImages(),
    staleTime: 60_000,
  });
}

function Landing() {
  const fetchNotices = useServerFn(listPublicNotices);
  const { data: notices = [] } = useQuery({
    queryKey: ["public-notices"],
    queryFn: () => fetchNotices(),
    staleTime: 60_000,
  });
  const { data: homepageImages = [] } = useHomepageImages();
  const tickerItems = notices.length
    ? notices.map((n) => `📢 ${n.title}`)
    : ANNOUNCEMENTS;
  const heroImage = (homepageImages as any[]).find((img) => img?.url);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <img src={wttiLogo} alt="Wote Technical Training Institute" className="h-10 w-auto rounded-md object-contain bg-white p-0.5 ring-1 ring-border" />
            <div className="hidden leading-tight sm:block">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Scheme of Work Management System</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">Features</a>
            <a href="#workflow" className="text-sm text-muted-foreground hover:text-foreground">Workflow</a>
            <a href="#contact" className="text-sm text-muted-foreground hover:text-foreground">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
            <Button asChild><Link to="/auth">Get started <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </div>
        </div>
      </header>

      {/* News ticker */}
      <div className="overflow-hidden border-b bg-primary text-primary-foreground">
        <div className="relative">
          <div className="flex w-max animate-marquee gap-12 py-2 text-sm">
            {[...tickerItems, ...tickerItems].map((t, i) => (
              <span key={i} className="whitespace-nowrap opacity-90">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className={`grid gap-12 py-16 lg:py-24 ${heroImage ? "lg:grid-cols-[1.05fr_0.95fr] lg:items-center" : ""}`}>
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-secondary-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                WTTI Academic Department
              </div>
              <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
                Every scheme of work, tracked from draft to approval
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                The system trainers, HODs and quality assurance officers at Wote Technical Training Institute use to submit, review and sign off academic documents — with a full audit trail at every stage.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg"><Link to="/auth">Sign in to your account <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                <Button asChild size="lg" variant="outline"><a href="#workflow">See how it works</a></Button>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-border pt-6">
                <Stat n="4" l="Document types" />
                <Stat n="5" l="Approval stages" />
                <Stat n="100%" l="Audit coverage" />
              </div>
            </div>

            {heroImage && (
              <div className="relative mx-auto w-full max-w-md lg:max-w-none">
                <div aria-hidden className="absolute -inset-3 -z-10 hidden rounded-[1.75rem] border border-accent/25 lg:block" />
                <figure className="overflow-hidden rounded-2xl border border-border bg-secondary shadow-sm">
                  <img
                    src={heroImage.url}
                    alt={heroImage.caption || "Wote Technical Training Institute campus"}
                    loading="lazy"
                    decoding="async"
                    className="h-[280px] w-full object-cover sm:h-[360px] lg:h-[440px]"
                  />
                </figure>
                {heroImage.caption && (
                  <div className="mx-4 -mt-6 rounded-xl border border-border bg-card px-4 py-3 shadow-md sm:mx-6 sm:max-w-xs">
                    <p className="text-sm font-medium text-foreground">{heroImage.caption}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Notices */}
      <NoticesBoard />

      {/* Gallery */}
      <Gallery excludeId={heroImage?.id} />

      {/* Features */}
      <section id="features" className="border-t bg-secondary/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <Eyebrow>What it does</Eyebrow>
            <h2 className="mt-2 text-3xl font-bold text-foreground sm:text-4xl">Everything academic planning needs</h2>
            <p className="mt-3 text-muted-foreground">Built around the realities of running a technical training institute.</p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-card p-6 transition-colors hover:bg-secondary/40">
                <f.icon className="h-5 w-5 text-accent" strokeWidth={1.75} />
                <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <Eyebrow>Process</Eyebrow>
            <h2 className="mt-2 text-3xl font-bold text-foreground sm:text-4xl">The approval workflow</h2>
            <p className="mt-3 text-muted-foreground">Every document follows a transparent, traceable path before it is finally approved.</p>
          </div>
          <ol className="mt-12 grid gap-x-8 gap-y-10 md:grid-cols-4">
            {WORKFLOW_STEPS.map((s) => (
              <li key={s.n}>
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm font-semibold text-accent">{String(s.n).padStart(2, "0")}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <h3 className="mt-3 font-semibold text-foreground">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-primary py-16 text-primary-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 text-center sm:px-6 lg:flex-row lg:justify-between lg:px-8 lg:text-left">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Ready to digitize your academic workflow?</h2>
            <p className="mt-2 text-primary-foreground/80">Sign in with your institute account or register a new one.</p>
          </div>
          <Button asChild size="lg" variant="secondary"><Link to="/auth">Get started <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <img src={wttiLogo} alt="Wote Technical Training Institute" className="h-10 w-auto rounded-md object-contain bg-white p-0.5" />
              <div>
                <div className="font-semibold">Wote Technical Training Institute</div>
                <div className="text-xs opacity-75">Scheme of Work Management System</div>
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm opacity-80">
              Building skilled, competent and innovative technicians for Kenya and beyond through quality technical training.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Contact</h4>
            <ul className="mt-3 space-y-2 text-sm opacity-90">
              <li className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Wote Town, Makueni County, Kenya</li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4" /> <a href="mailto:info@wotetti.ac.ke" className="hover:opacity-100">info@wotetti.ac.ke</a></li>
              <li className="flex items-center gap-2"><Phone className="h-4 w-4" /> <a href="tel:+254728658649" className="hover:opacity-100">+254 728 658 649</a></li>
              <li className="flex items-center gap-2"><Workflow className="h-4 w-4" /> <a href="https://wotetti.ac.ke" target="_blank" rel="noreferrer" className="hover:opacity-100">wotetti.ac.ke</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Quick links</h4>
            <ul className="mt-3 space-y-2 text-sm opacity-90">
              <li><a href="#features" className="hover:opacity-100">Features</a></li>
              <li><a href="#workflow" className="hover:opacity-100">Workflow</a></li>
              <li><Link to="/auth" className="hover:opacity-100">Sign in</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-sidebar-border">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs opacity-75 sm:flex-row sm:px-6 lg:px-8">
            <div>© {new Date().getFullYear()} Wote Technical Training Institute. All rights reserved.</div>
            <div className="flex gap-4">
              <span>Privacy Policy</span>
              <span>Terms of Use</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Eyebrow({ icon: Icon, children }: { icon?: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </div>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-foreground">{n}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{l}</div>
    </div>
  );
}

function Gallery({ excludeId }: { excludeId?: string }) {
  const { data: images = [] } = useHomepageImages();

  const visible = (images as any[]).filter((img) => img.url && img.id !== excludeId);
  if (!visible.length) return null;

  return (
    <section className="border-t bg-background py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Eyebrow icon={Images}>Gallery</Eyebrow>
        <h2 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">Life at WoteTI</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Moments from our workshops, labs and campus.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((img: any) => (
            <figure key={img.id} className="group relative overflow-hidden rounded-xl border border-border bg-card">
              <img
                src={img.url}
                alt={img.caption || "Wote Technical Training Institute"}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="h-56 w-full object-cover transition duration-300 group-hover:scale-105"
              />
              {img.caption && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8 text-sm font-medium text-white">
                  {img.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function NoticesBoard() {
  const fetchNotices = useServerFn(listPublicNotices);
  const { data: notices = [] } = useQuery({
    queryKey: ["public-notices"],
    queryFn: () => fetchNotices(),
    staleTime: 60_000,
  });

  if (!notices.length) return null;

  return (
    <section className="border-t bg-background py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Eyebrow icon={Megaphone}>Notice board</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">Latest announcements</h2>
            <p className="mt-2 text-muted-foreground">Updates from the WTTI academic office.</p>
          </div>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {notices.map((n) => (
            <article key={n.id} className="rounded-xl border border-border bg-card p-6 transition hover:shadow-md">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">{n.title}</h3>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {n.audience === "all" ? "Everyone" : "Trainers"}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
              <div className="mt-4 text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
