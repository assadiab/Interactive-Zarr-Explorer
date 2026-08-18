/**
 * Parse an ilastik-style tracking CSV into a per-track model the viewer can render.
 *
 * The CSV is read entirely on the client (no server). It is kept separate from the OME-Zarr — nothing is written back.
 * Expected columns (ilastik "CSV-Table" export):
 *   - `trackId`               — the track a detection belongs to
 *   - `frame`                 — the timepoint (T)
 *   - `Center_of_the_object_0/1/2` — centroid X / Y / Z (Z optional)
 *
 * When the measurement table eventually lives inside the zarr, a second loader can produce the same {@link TrackingData}
 * shape so the rest of the pipeline is unchanged.
 */

/** One detection: a centroid at a given timepoint. Coordinates are in image (voxel) space. */
export interface TrackPoint {
  t: number;
  x: number;
  y: number;
  /** 0 for 2D data (see {@link TrackingData.hasZ}). */
  z: number;
}

/** All detections of a single track, sorted by ascending time. */
export interface Track {
  trackId: number;
  points: TrackPoint[];
}

/** The full parsed tracking result, plus a few facts the renderer needs up front. */
export interface TrackingData {
  tracks: Track[];
  /** True if the data is genuinely 3D (Z present and varying); otherwise every `z` is 0. */
  hasZ: boolean;
  /** Inclusive frame range across every point, e.g. for the time slider. */
  tMin: number;
  tMax: number;
}

/** Column names we look for, in priority order (matched case-insensitively). */
const COLUMN_ALIASES = {
  trackId: ["trackId", "track_id", "track"],
  frame: ["frame", "t", "time", "timestep"],
  x: ["Center_of_the_object_0", "centroid_x", "x"],
  y: ["Center_of_the_object_1", "centroid_y", "y"],
  z: ["Center_of_the_object_2", "centroid_z", "z"],
};

/** Split one CSV line into fields, honoring simple double-quoted values (which may contain commas). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Parse a CSV field to a number, treating blank fields as invalid (`Number("")` is 0 in JS, which we must reject). */
function toNumber(field: string | undefined): number {
  if (field === undefined || field.trim() === "") {
    return NaN;
  }
  return Number(field);
}

/** Find the index of the first header that matches any of `aliases` (case-insensitive), or -1. */
function findColumn(header: string[], aliases: string[]): number {
  const lower = header.map((h) => h.toLowerCase());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.toLowerCase());
    if (idx !== -1) {
      return idx;
    }
  }
  return -1;
}

/**
 * Parse the text of a tracking CSV into {@link TrackingData}.
 *
 * @throws {Error} if the required `trackId`, `frame`, X or Y columns are missing.
 */
export function parseTracksCsv(text: string): TrackingData {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    throw new Error("Tracking CSV is empty or has no data rows.");
  }

  const header = splitCsvLine(lines[0]);
  const cols = {
    trackId: findColumn(header, COLUMN_ALIASES.trackId),
    frame: findColumn(header, COLUMN_ALIASES.frame),
    x: findColumn(header, COLUMN_ALIASES.x),
    y: findColumn(header, COLUMN_ALIASES.y),
    z: findColumn(header, COLUMN_ALIASES.z),
  };

  const missing = (["trackId", "frame", "x", "y"] as const).filter((k) => cols[k] === -1);
  if (missing.length > 0) {
    throw new Error(
      `Tracking CSV is missing required column(s): ${missing.join(", ")}. Found headers: ${header.join(", ")}`
    );
  }

  const byTrack = new Map<number, TrackPoint[]>();
  let zSeen = false;
  let firstZ: number | undefined;
  let zVaries = false;
  let tMin = Infinity;
  let tMax = -Infinity;

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const trackId = toNumber(fields[cols.trackId]);
    const t = toNumber(fields[cols.frame]);
    const x = toNumber(fields[cols.x]);
    const y = toNumber(fields[cols.y]);
    // Skip rows we can't place (blank/garbage trackId, frame, or position).
    if (!Number.isFinite(trackId) || !Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    let z = 0;
    if (cols.z !== -1) {
      const parsedZ = toNumber(fields[cols.z]);
      if (Number.isFinite(parsedZ)) {
        z = parsedZ;
        // Mirror the POC's Z-usage heuristic: a Z column counts only if values are present and actually vary.
        if (firstZ === undefined) {
          firstZ = z;
        } else if (z !== firstZ) {
          zVaries = true;
        }
        if (z !== 0) {
          zSeen = true;
        }
      }
    }

    const points = byTrack.get(trackId) ?? [];
    points.push({ t, x, y, z });
    byTrack.set(trackId, points);

    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }

  const hasZ = zSeen && zVaries;

  const tracks: Track[] = [];
  for (const [trackId, points] of byTrack) {
    points.sort((a, b) => a.t - b.t);
    if (!hasZ) {
      for (const p of points) {
        p.z = 0;
      }
    }
    tracks.push({ trackId, points });
  }
  tracks.sort((a, b) => a.trackId - b.trackId);

  return {
    tracks,
    hasZ,
    tMin: Number.isFinite(tMin) ? tMin : 0,
    tMax: Number.isFinite(tMax) ? tMax : 0,
  };
}
