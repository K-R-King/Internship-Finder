import { ImageResponse } from "next/og";

// the preview card shown when a link to this site is shared (group chats, Discord, social media)
export const alt = "Internship Finder: open internships for university students, in one search.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "linear-gradient(135deg, #001a33 0%, #003262 60%, #0b4a7a 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#fdb515", fontWeight: 700, letterSpacing: 2 }}>FOR UNIVERSITY STUDENTS</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800 }}>Internship Finder</div>
          <div style={{ display: "flex", fontSize: 40, color: "#cfe0f0", marginTop: 20, maxWidth: 960 }}>Open internships from company job boards and student-run lists, in one search.</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#9fbbd6" }}>Free. Refreshed every day.</div>
      </div>
    ),
    size,
  );
}
