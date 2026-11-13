const path = require('node:path');
const root = path.resolve(__dirname, '..');
module.exports = { root, etc: (...p) => path.join(root, 'etc', ...p), output: (...p) => path.join(root, 'var/tmp/yhwh', ...p) };
