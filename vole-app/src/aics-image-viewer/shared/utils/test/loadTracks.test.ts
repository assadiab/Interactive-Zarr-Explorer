import { describe, expect, it } from "@jest/globals";

import { parseTracksCsv } from "../loadTracks";

describe("parseTracksCsv", () => {
  it("groups rows by track, sorts each track by time, and reports the frame range (2D)", () => {
    // Rows deliberately out of order and interleaved between two tracks.
    const csv = [
      "trackId,frame,Center_of_the_object_0,Center_of_the_object_1,Center_of_the_object_2",
      "1,2,10,20,0",
      "2,0,5,5,0",
      "1,0,0,0,0",
      "2,1,6,7,0",
      "1,1,5,10,0",
    ].join("\n");

    const { tracks, hasZ, tMin, tMax } = parseTracksCsv(csv);

    expect(hasZ).toBe(false);
    expect(tMin).toBe(0);
    expect(tMax).toBe(2);
    expect(tracks.map((t) => t.trackId)).toEqual([1, 2]);

    const track1 = tracks.find((t) => t.trackId === 1)!;
    expect(track1.points.map((p) => p.t)).toEqual([0, 1, 2]); // sorted
    expect(track1.points[2]).toEqual({ t: 2, x: 10, y: 20, z: 0 });
  });

  it("detects genuine 3D data (Z present and varying)", () => {
    const csv = [
      "trackId,frame,Center_of_the_object_0,Center_of_the_object_1,Center_of_the_object_2",
      "1,0,0,0,3",
      "1,1,1,1,7",
    ].join("\n");

    const { hasZ, tracks } = parseTracksCsv(csv);
    expect(hasZ).toBe(true);
    expect(tracks[0].points[1].z).toBe(7);
  });

  it("treats a constant/zero Z column as 2D and zeroes every z", () => {
    const csv = [
      "trackId,frame,Center_of_the_object_0,Center_of_the_object_1,Center_of_the_object_2",
      "1,0,0,0,4",
      "1,1,1,1,4",
    ].join("\n");

    const { hasZ, tracks } = parseTracksCsv(csv);
    expect(hasZ).toBe(false);
    expect(tracks[0].points.every((p) => p.z === 0)).toBe(true);
  });

  it("accepts column aliases (track_id / t) and ignores unrelated columns", () => {
    const csv = ["track_id,t,x,y,extra", "9,0,1,2,foo", "9,1,3,4,bar"].join("\n");
    const { tracks } = parseTracksCsv(csv);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].trackId).toBe(9);
    expect(tracks[0].points[1]).toEqual({ t: 1, x: 3, y: 4, z: 0 });
  });

  it("skips rows with a non-numeric trackId, frame, or position", () => {
    const csv = ["trackId,frame,x,y", "1,0,0,0", ",1,5,5", "1,,5,5", "1,2,bad,5"].join("\n");
    const { tracks } = parseTracksCsv(csv);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].points).toHaveLength(1);
  });

  it("throws when a required column is missing", () => {
    const csv = ["trackId,frame,x", "1,0,0"].join("\n"); // no Y
    expect(() => parseTracksCsv(csv)).toThrow(/missing required column/i);
  });
});
