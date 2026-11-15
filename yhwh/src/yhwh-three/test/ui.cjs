// Run every desktop behavior against Three as well; parity is executable.
process.env.YHWH_TEST_INTERFACE = 'three';
require('../../yhwh-default/test/ui.cjs');
