import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Calculator,
  ClipboardList,
  FileText,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/projects/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PROJECT_STATUSES,
  isActiveProjectStatus,
  labelFor,
} from "@/lib/constants/projects";
import { requireOrganisation } from "@/lib/auth";
import { clientName, listProjects } from "@/lib/projects-data";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const { profile } = await requireOrganisation();
  const supabase = await createClient();

  const { data: projects, error } = await listProjects(
    supabase,
    profile.organisation_id!
  );

  if (error) {
    console.error("[DashboardPage] Failed to load projects:", error);
  }

  const allProjects = projects ?? [];
  const recentProjects = allProjects.slice(0, 5);
  const activeCount = allProjects.filter((p) =>
    isActiveProjectStatus(p.status)
  ).length;
  const estimatesInProgress = allProjects.filter(
    (p) => p.status === "estimating"
  ).length;
  const waitingOnSubbies = allProjects.filter(
    (p) => p.status === "waiting_on_subbies"
  ).length;
  const quotesReady = allProjects.filter(
    (p) => p.status === "ready_to_quote"
  ).length;

  const displayName =
    profile.full_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ");

  const metricCards = [
    {
      label: "Active Projects",
      value: activeCount,
      href: "/projects",
      icon: Briefcase,
    },
    {
      label: "Estimates in Progress",
      value: estimatesInProgress,
      href: "/estimates",
      icon: Calculator,
    },
    {
      label: "Waiting on Subbies",
      value: waitingOnSubbies,
      href: "/projects",
      icon: Users,
    },
    {
      label: "Quotes Ready",
      value: quotesReady,
      href: "/quotes",
      icon: FileText,
    },
  ];

  const quickActions = [
    { label: "Add Rate", href: "/rates", icon: ClipboardList },
    { label: "Add Subcontractor", href: "/subcontractors", icon: Users },
    { label: "View Estimates", href: "/estimates", icon: Calculator },
    { label: "View Projects", href: "/projects", icon: Briefcase },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Capture enquiries, scope the work and build quotes."
        action={
          <Button asChild className="hidden md:inline-flex">
            <Link href="/projects/new">
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </Button>
        }
      />

      <Button asChild size="lg" className="w-full md:hidden">
        <Link href="/projects/new">
          <Plus className="h-5 w-5" />
          New Project
        </Link>
      </Button>

      <section aria-label="Project metrics">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {metricCards.map((card) => (
            <Link key={card.label} href={card.href} className="group block">
              <Card className="h-full rounded-xl transition-colors hover:bg-accent/40">
                <CardContent className="p-4 md:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <card.icon className="h-4 w-4 text-muted-foreground md:h-5 md:w-5" />
                    </div>
                    <span className="text-2xl font-bold tabular-nums md:text-3xl">
                      {card.value}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground md:text-sm">
                    {card.label}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-xl lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-semibold normal-case tracking-normal">
              Recent Projects
            </CardTitle>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex"
            >
              <Link href="/projects">
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentProjects.length > 0 ? (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentProjects.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/projects/${project.id}`}
                              className="hover:underline"
                            >
                              {project.title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {clientName(project)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={labelFor(PROJECT_STATUSES, project.status)}
                            />
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatDate(project.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 md:hidden">
                  {recentProjects.slice(0, 4).map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Briefcase className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{project.title}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {clientName(project)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge
                            label={labelFor(PROJECT_STATUSES, project.status)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {formatDate(project.created_at)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No projects yet. Tap New Project when an enquiry comes in.
                </p>
              </div>
            )}

            {recentProjects.length > 0 && (
              <div className="mt-4 md:hidden">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/projects">View all projects</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hidden rounded-xl md:block">
          <CardHeader>
            <CardTitle className="text-base font-semibold normal-case tracking-normal">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((action) => (
              <Button
                key={action.href}
                asChild
                variant="outline"
                className="w-full justify-start"
              >
                <Link href={action.href}>
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {displayName && (
        <p className="text-center text-sm text-muted-foreground md:text-left">
          Signed in as {displayName}
        </p>
      )}
    </div>
  );
}
