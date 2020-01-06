const conf = require('../config');
const util = require('../commonUtil').Util;

// we will only use users with id ending in 1, eg. 1245241, as part of federated design
async function stressTestUserCount(count, intervalSeconds, svc) {
    let users = [];
    for (i = 0; i < count; i++) {
        users.push((1E5 + Math.round(Math.random() * 1E5)) * 10 + 1);
    }
    let r = await util.sendHttpRequest('post', {
        'users': users,
        'intervalSec': intervalSeconds
    }, svc, '/start_crawling_users');
}

(
    async () => {
        stressTestUserCount(process.argv[2], conf.crawlerIntervalSeconds, conf.crawlerService);  //<~3000, too high will produce problems
    }
)()