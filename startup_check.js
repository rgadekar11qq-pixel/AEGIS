const fs = require('fs');
const log = [];
process.on('uncaughtException', e => { log.push('UNCAUGHT: ' + e.message + '\n' + e.stack); fs.writeFileSync('d:/AWS/startup_check.txt', log.join('\n')); process.exit(1); });
try {
  log.push('1. Loading arbiter...');
  const { runArbiter } = require('./src/orchestrator/arbiter');
  log.push('   OK: ' + typeof runArbiter);
  log.push('2. Loading pipeline...');
  const { runAegisPipeline } = require('./src/orchestrator/pipeline');
  log.push('   OK: ' + typeof runAegisPipeline);
  log.push('3. Loading server...');
  require('./src/server');
  log.push('4. Server loaded');
} catch (e) {
  log.push('ERROR: ' + e.message + '\n' + e.stack);
}
fs.writeFileSync('d:/AWS/startup_check.txt', log.join('\n'));
