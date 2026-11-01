const floors = {22: [22,23,4], 24: [24,22,1], 26: [26,12,1]};
const current = process.versions.node.split('.').map(Number);
const floor = floors[current[0]];
if (!/^\d+\.\d+\.\d+$/.test(process.versions.node) || !floor || current[1] < floor[1] || (current[1] === floor[1] && current[2] < floor[2])) {
  console.error('Sol.A requires a patched Node.js: 22.23.4+, 24.22.1+ or 26.12.1+ within those supported majors. Current: ' + process.versions.node);
  process.exit(1);
}
