// the EECS Hub and its tools link to each other; locally the hub runs on port 3004 and the
// tools on 3000, 3002, 3003, 3001 and 3005
const dev = process.env.NODE_ENV === "development";

export const HOME_URL = process.env.NEXT_PUBLIC_HUB_URL ?? (dev ? "http://localhost:3004" : "https://eecs-hub.vercel.app");

export const SUITE = [
  { id: "planner", label: "Planner", icon: "🗺️", url: process.env.NEXT_PUBLIC_PLANNER_URL ?? (dev ? "http://localhost:3000" : "https://eecs-planner.vercel.app") },
  { id: "prereqs", label: "Prereqs", icon: "🧭", url: process.env.NEXT_PUBLIC_PREREQS_URL ?? (dev ? "http://localhost:3002" : "https://eecs-prereqs.vercel.app") },
  { id: "electives", label: "Electives", icon: "🎯", url: process.env.NEXT_PUBLIC_ELECTIVES_URL ?? (dev ? "http://localhost:3003" : "https://eecs-electives.vercel.app") },
  { id: "links", label: "Links", icon: "🔗", url: process.env.NEXT_PUBLIC_LINKS_URL ?? (dev ? "http://localhost:3001" : "https://eecs-links.vercel.app") },
  { id: "internships", label: "Internships", icon: "💼", url: process.env.NEXT_PUBLIC_INTERNSHIPS_URL ?? (dev ? "http://localhost:3005" : "https://find-internships.vercel.app") },
] as const;

export type SiteId = (typeof SUITE)[number]["id"];

export const siteUrl = (id: SiteId) => SUITE.find((s) => s.id === id)!.url;
