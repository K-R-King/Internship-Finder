// Makes public/us-places.json, the map behind "within 50 miles", from GeoNames' free list of cities (CC BY 4.0).
// U.S. cities barely move, so this is run by hand and the result is committed:
//   download https://download.geonames.org/export/dump/cities500.zip, unzip it, then
//   node scripts/build-places.mjs path/to/cities500.txt
import { readFileSync, writeFileSync } from "node:fs";

const round = (n) => Math.round(Number(n) * 100) / 100;  // about half a mile

const table = {};
for (const line of readFileSync(process.argv[2], "utf8").split("\n")) {
  const c = line.split("\t");
  if (c[8] !== "US" || !/^[A-Z]{2}$/.test(c[10] ?? "")) continue;
  // the two names job listings almost never use
  const name = c[2].replace(/, D\.C\.$/, "").replace(/^New York City$/, "New York");
  (table[c[10]] ??= []).push([name, round(c[4]), round(c[5]), Number(c[14])]);
}
// sites employers list often that are too small for GeoNames' list
for (const [state, name, latitude, longitude] of [
  ["TX", "Starbase", 25.99, -97.19], ["MD", "Annapolis Junction", 39.12, -76.79], ["CA", "Playa Vista", 33.97, -118.43],
  ["NV", "McCarran", 39.55, -119.5], ["FL", "Eglin AFB", 30.46, -86.55], ["CA", "Vandenberg", 34.73, -120.57],
  ["VA", "Quantico", 38.52, -77.29], ["VA", "Wallops Island", 37.85, -75.48], ["PA", "Oaks", 40.13, -75.46], ["CT", "Simsbury", 41.88, -72.8],
]) table[state].push([name, latitude, longitude, 0]);

for (const cities of Object.values(table)) cities.sort((a, b) => b[3] - a[3]);

writeFileSync("public/us-places.json", JSON.stringify(table));
console.log(Object.values(table).flat().length, "places in", Object.keys(table).length, "states");
