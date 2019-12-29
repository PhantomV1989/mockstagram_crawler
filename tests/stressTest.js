const conf = require('../config');
const util = require('../commonUtil');

async function stressTestUserCount(count, intervalSeconds, svc) {
    let users = [];
    for (i = 0; i < count; i++) {
        users.push(1E6 + Math.round(Math.random() * 1E6));
    }
    let r = await util.sendHttpRequest('post', {
        'users': users,
        'intervalS': intervalSeconds
    }, svc, '/start_crawling_users');
}

(
    async () => {
        stressTestUserCount(3, 1, conf.crawlerService);
        //stressTestUserCount(200, 1, 'localhost:6347');
        // stressTestUserCount(200, 1, 'localhost:6348');
    }
)()