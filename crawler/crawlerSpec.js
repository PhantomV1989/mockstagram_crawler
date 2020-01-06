// for jasmine, integration tests. Warning, this uses the test platform
// Most features have external dependencies, hard to unit test
const body_parser = require("body-parser");
const app = require('express')();
const conf = require('../config');
const Util = require('../commonUtil').Util;

describe("Crawler worker:", function () {
    let workerPort = 30000;

    //This will be called before running each spec
    beforeEach(function () {
        await Util.startNewChildProcess('node', ['--max_old_space_size=8192',
            '--optimize_for_size', '--stack_size=4096', '--nouse-idle-notification',
            './crawler/crawlerWorker.js', workerPort, ''])
    });

    describe("when calc is used to peform basic math operations", function () {
        it("", function () {
            throw Error('not done!');
        });
    });
});