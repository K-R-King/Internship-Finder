# Internship Finder

Open internships for university students, gathered from company job boards and student-run lists into one search.

## Features

- **One list from many sources**, with the same posting from different sources merged, and ended terms and long-abandoned listings left out.
- **Search and filters:** company or role, location, field, season, open to undergrads, remote, and visa sponsorship.
- **Saved and Applied tracking**, stored in your browser. Tracked listings stay after they close, marked "No longer listed".
- **New since your last visit:** listings added since you last came by are labeled, with a filter to show only those.
- **Searches in the address:** `?q=security&field=Software&location=LA` opens that search, which is how the EECS Planner links here.
- Light and dark mode, and a layout that works on phones.

## Where the listings come from

| Source | What it covers |
| --- | --- |
| [SimplifyJobs list](https://github.com/SimplifyJobs/Summer2027-Internships) | Community-maintained, mostly tech |
| [Summer Internships list](https://github.com/vanshb03/Summer2027-Internships) | Community-maintained, mostly tech |
| Greenhouse, Lever and Ashby | The public job boards of the companies in [`data/boards.json`](data/boards.json) |

This isn't every internship: no public source has them all. LinkedIn forbids automated access and Handshake needs a login, so their listings aren't gathered; instead, buttons open the student's current search on LinkedIn and Simplify. Coverage is strongest for tech roles in the U.S. To cover more, add companies to `data/boards.json`. The key is the company's name in its job board address, such as `stripe` in `boards.greenhouse.io/stripe`.

## Running locally

```bash
npm install
npm run sync   # refresh public/internships.json
npm run dev
```

Open `http://localhost:3005`.

`npm run sync` skips a source that fails, and keeps the old file if the result shrinks by more than half. `.github/workflows/refresh.yml` runs it every day and opens an issue if anything goes wrong.

Short links are swapped for the pages they lead to, and those answers are kept in `data/short-links.json`. Listings are dropped when their job has left its Greenhouse, Lever or Ashby board, or when one list marks a page closed. Most other job sites answer a closed job with a normal page, so those can't be checked and may stay listed until a list removes them.

```bash
npm test                # listing clean-up rules
npx playwright test     # the page, with accessibility checks
```
