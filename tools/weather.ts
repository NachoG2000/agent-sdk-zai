import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

type GeocodeHit = { latitude: number; longitude: number; name: string; country?: string; admin1?: string };

async function geocode(place: string): Promise<GeocodeHit | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = (await res.json()) as { results?: GeocodeHit[] };
  return data.results?.[0] ?? null;
}

export const getWeather = tool(
  "get_weather",
  "Get the current weather for a place by name (city, landmark, etc.). Uses Open-Meteo, no API key required.",
  {
    place: z.string().describe("Place name, e.g. 'Buenos Aires' or 'Mount Fuji'"),
  },
  async ({ place }) => {
    const hit = await geocode(place);
    if (!hit) {
      return { content: [{ type: "text", text: `No location found for "${place}".` }] };
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Forecast failed: ${res.status}`);
    const data = (await res.json()) as {
      current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number };
    };
    const where = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
    const c = data.current;
    const text = `Weather in ${where}: ${c.temperature_2m}°C, humidity ${c.relative_humidity_2m}%, wind ${c.wind_speed_10m} km/h (WMO code ${c.weather_code}).`;
    return { content: [{ type: "text", text }] };
  },
);
