import { useEffect, useState } from "react";

export type Route =
  | { name: "landing" }
  | { name: "cases" }
  | { name: "case"; id: string }
  | { name: "new" }
  | { name: "transactions" };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  const parts = clean.split("/").filter(Boolean);

  if (parts.length === 0) return { name: "landing" };
  if (parts[0] === "cases" && parts[1]) {
    return { name: "case", id: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "cases") return { name: "cases" };
  if (parts[0] === "new") return { name: "new" };
  if (parts[0] === "transactions") return { name: "transactions" };
  return { name: "landing" };
}

export function href(route: Route): string {
  switch (route.name) {
    case "cases":
      return "#/cases";
    case "case":
      return "#/cases/" + encodeURIComponent(route.id);
    case "new":
      return "#/new";
    case "transactions":
      return "#/transactions";
    default:
      return "#/";
  }
}

export function navigate(route: Route) {
  window.location.hash = href(route).replace(/^#/, "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}
