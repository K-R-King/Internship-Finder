import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/suite";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl("internships"), changeFrequency: "daily", priority: 1 }];
}
