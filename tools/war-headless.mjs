// war-headless.mjs - a whole WAR with no commander: both empires on their brains and pilots; prints the war each minute
//   node tools/war-headless.mjs [seed]
import { createWorld } from '../src/war/world.js';
const seed = +(process.argv[2] || 1);
const w = createWorld({ seed });
const t0 = Date.now(); let worst = 0, peak = 0;
for (let t = 0; t < 30 * 720 + 2 && !w.result; t++) {
  const a = performance.now(); w.step(); worst = Math.max(worst, performance.now() - a); peak = Math.max(peak, w.U.count[0] + w.U.count[1]);
  if (t % (30 * 60) === 0) console.log(`${w.time.toFixed(0)}s outposts ${w.owned(0)}/${w.owned(1)} bodies ${w.U.count[0]}/${w.U.count[1]} kills ${w.S.stats.kills} ships up ${w.ships.map((s) => s.filter((x) => x.i >= 0).length)}`);
}
console.log('result', JSON.stringify(w.result), '· wall', ((Date.now() - t0) / 1000).toFixed(1) + 's · worst tick', worst.toFixed(1) + 'ms · peak bodies', peak, '· outposts', w.nodes.length);
