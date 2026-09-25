// lanes.js — THE ONE GEOMETRY SOURCE. Three lanes between two sides' gates, five checkpoints a lane,
// two keeps a side in the yards behind the gates. Every number the field is built from lives here and
// nowhere else: the sim marches on it, the bot and the coach read it, the painter, the drag, the minimap
// and the probe convert with it. Pure constants and pure helpers, no imports, no state.
//
// The field is 9000 × 5000 world units. The RUN is x 1100..7900 (the gates stand on its ends); the YARDS
// are the strips outside it where the keeps stand. Inside the run three BANDS, 800 wide, are centred on
// LANE_Y; between them is the VOID no body may enter. The west (team 0) gates at x 1100, the east
// (team 1) at x 7900; the west keeps at x 500, the east at x 8500.

export const W = 9000, H = 5000;
export const LANE_Y = [1000, 2500, 4000];      // the three band centre-lines
export const HALF = 400;                        // a band's half-width
export const VOID = 700;                        // the void between two bands (LANE_Y gap 1500 − 2·HALF)
export const RUN = [1100, 7900];                // the run: gate to gate
export const GATE_X = [1100, 7900];             // by team: west, east
export const KEEP_X = [500, 8500];              // by team
export const KEEP_Y = [1750, 3250];             // keep 0 stands between lanes 0 and 1, keep 1 between lanes 1 and 2
export const CP_X = [1900, 3200, 4500, 5800, 7100];   // the five checkpoints of a lane, slot 0 nearest the west
export const CENTRE = 2;                        // the slot that is THE CENTRE (x 4500, pays double)
export const GATE_HP = 2500, KEEP_HP = 3500;
export const GATE_R = 110, KEEP_R = 130, CP_R = 70;
export const CP_REACH = 260;                    // a body within this of a checkpoint stands on it
export const RALLY_R = 300;                     // a held checkpoint heals its owner's bodies within this
export const DROP_MIN = 1300, DROP_MAX = 7700;  // where an order's x may land
export const MUSTER_AHEAD = 220;                // a formation forms this far past its gate's edge, toward the enemy

// the nearest band centre to a y: the boundaries fall halfway between the lanes
export function laneOf(y) { return y < 1750 ? 0 : y < 3250 ? 1 : 2; }
export function inRun(x) { return x >= RUN[0] && x <= RUN[1]; }
export function inBand(lane, y) { return Math.abs(y - LANE_Y[lane]) <= HALF; }
// a body of radius r kept inside its band
export function clampY(lane, y, r) {
  const lo = LANE_Y[lane] - HALF + r, hi = LANE_Y[lane] + HALF - r;
  return y < lo ? lo : y > hi ? hi : y;
}

// indices into the sim's tables: WL (checkpoints) is lane·5 + slot; T (strongholds) is team·5 + lane for a gate, team·5 + 3 + k for a keep
export function cp(lane, slot) { return lane * 5 + slot; }
export function gate(team, lane) { return team * 5 + lane; }
export function keep(team, k) { return team * 5 + 3 + k; }
// a gate's lane; a keep's is the lane whose yard walk it stands beside (keep 0 → lane 0, keep 1 → lane 2)
export function towerLane(t) { const q = t % 5; return q < 3 ? q : q === 3 ? 0 : 2; }

// the slots in the order a side takes them; shared arrays, never to be written
const TOWARD = [[0, 1, 2, 3, 4], [4, 3, 2, 1, 0]];
export function slotsToward(team) { return TOWARD[team]; }

// THE FRONT of a lane for a side: the midpoint between the last checkpoint that side holds, counting from its own end
// without a gap, and the next point along (its gate → slot 0 gives 1500 for the west, slot 4 → the east gate gives 7500)
export function frontX(owners, team) {
  const order = TOWARD[team];
  let held = 0;
  for (; held < 5 && owners[order[held]] === team; held++);
  const from = held === 0 ? GATE_X[team] : CP_X[order[held - 1]];
  const to = held === 5 ? GATE_X[1 - team] : CP_X[order[held]];
  return (from + to) / 2;
}

// which of the six stretches of the run an x lies in: 0 before the first checkpoint, 5 past the last
export function segment(x) { let s = 0; while (s < 5 && x >= CP_X[s]) s++; return s; }

// LANE WORDS: the sim knows lanes 0/1/2; the glass spells them. Portrait stands the field up, so the words turn with the side.
export const LANE_WORDS = {
  portrait: [['LEFT', 'CENTRE', 'RIGHT'], ['RIGHT', 'CENTRE', 'LEFT']],
  landscape: ['TOP', 'CENTRE', 'BOTTOM'],
  desk: ['TOP', 'CENTRE', 'BOTTOM'],
};
export function laneWord(glass, team, lane) {
  const words = glass === 'portrait' ? LANE_WORDS.portrait[team] : (LANE_WORDS[glass] || LANE_WORDS.desk);
  return words[lane];
}
// 'CENTRE · POINT 3' (slots count from 1) · 'CENTRE · THE CENTRE' for the centre slot
export function pointName(glass, team, lane, slot) {
  return laneWord(glass, team, lane) + ' · ' + (slot === CENTRE ? 'THE CENTRE' : 'POINT ' + (slot + 1));
}
