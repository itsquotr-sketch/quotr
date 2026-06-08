import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const publicRoutes = ["/login", "/signup", "/auth/callback"];

const appRoutes = [
  "/dashboard",
  "/projects",
  "/estimates",
  "/quotes",
  "/rates",
  "/assemblies",
  "/subcontractors",
  "/rfqs",
  "/settings",
];

const legacyRedirects: Record<string, string> = {
  "/jobs": "/projects",
  "/site-visits": "/projects",
  "/site-visits/new": "/projects/new",
};

export async function middleware(request: NextRequest) {
  // Allow Server Action POSTs through without redirect interference
  if (request.method === "POST" && request.headers.has("next-action")) {
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;

  if (legacyRedirects[pathname]) {
    const url = request.nextUrl.clone();
    url.pathname = legacyRedirects[pathname];
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/site-visits/") && pathname !== "/site-visits/new") {
    const url = request.nextUrl.clone();
    url.pathname = "/projects";
    return NextResponse.redirect(url);
  }

  const { supabaseResponse, user, supabase } = await updateSession(request);

  const isPublicRoute =
    publicRoutes.some((route) => pathname.startsWith(route)) ||
    pathname === "/";

  const isAppRoute = appRoutes.some((route) => pathname.startsWith(route));

  if (!user && !isPublicRoute && pathname !== "/onboarding") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  let hasOrganisation = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organisation_id")
      .eq("id", user.id)
      .single();

    hasOrganisation = Boolean(profile?.organisation_id);
  }

  if (user && !hasOrganisation && isAppRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  if (user && hasOrganisation && pathname === "/onboarding") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = hasOrganisation ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
