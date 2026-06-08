"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/projects/status-badge";
import {
  ENQUIRY_SOURCES,
  ENQUIRY_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  labelFor,
} from "@/lib/constants/projects";
import {
  clientName,
  scopeCount,
  type ProjectListRow,
} from "@/lib/projects-data";
import { formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ProjectsListProps {
  projects: ProjectListRow[];
}

export function ProjectsList({ projects }: ProjectsListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;

    return projects.filter((project) => {
      const haystack = [
        project.title,
        clientName(project),
        project.site_address,
        labelFor(ENQUIRY_SOURCES, project.enquiry_source),
        labelFor(PROJECT_STATUSES, project.status),
        labelFor(PROJECT_PRIORITIES, project.priority),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [projects, query]);

  return (
    <div>
      <Input
        type="search"
        placeholder="Search projects by title, client, address or status…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-6"
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? "No projects match your search."
              : "No projects to show."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-medium">
                        {project.title}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {clientName(project)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {project.site_address}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {labelFor(ENQUIRY_SOURCES, project.enquiry_source)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={labelFor(PROJECT_STATUSES, project.status)}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={labelFor(
                            PROJECT_PRIORITIES,
                            project.priority
                          )}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {scopeCount(project)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(project.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/projects/${project.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="rounded-xl border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{project.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {clientName(project)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {project.site_address}
                    </p>
                  </div>
                  <StatusBadge
                    label={labelFor(PROJECT_STATUSES, project.status)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge
                    label={labelFor(
                      PROJECT_PRIORITIES,
                      project.priority
                    )}
                  />
                  <StatusBadge
                    label={labelFor(
                      ENQUIRY_STATUSES,
                      project.enquiry_status
                    )}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {labelFor(ENQUIRY_SOURCES, project.enquiry_source)}
                  </span>
                  <span>
                    {scopeCount(project)} scope
                    {scopeCount(project) === 1 ? "" : "s"} ·{" "}
                    {formatDate(project.created_at)}
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                  <Link href={`/projects/${project.id}`}>
                    Open
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
