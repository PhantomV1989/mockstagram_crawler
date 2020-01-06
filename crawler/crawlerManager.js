const body_parser = require("body-parser");
const app = require('express')();
const conf = require('../config');
const Util = require('../commonUtil').Util;
const Routines = require('./crawlerRoutines').Routines;

const host = conf.crawlerHost;
const port = conf.crawlerManagerPort;

let workerStatus = {};
let workerIDIter = port;
let mongoCollection = undefined;

app.use(body_parser.json());


class CrawlerManager {
    static async startNewWorker(wID, dest) {
        return Util.startNewChildProcess('node', ['--max_old_space_size=8192',
            '--optimize_for_size', '--stack_size=4096', '--nouse-idle-notification',
            './crawler/crawlerWorker.js', wID, dest]);
    }

    static async sendTaskToWorker(body, worker) {
        let retry = 0;
        let workerSvc = host + ':' + worker;

        return new Promise(async (rs, rj) => {
            while (1) {
                try {
                    let workerResponse = await Util.sendHttpRequest('post', body, workerSvc, '/start_crawling_users');
                    workerStatus[worker] = +(workerResponse['current_task_count']);
                    rs(true);
                    break;
                } catch (e) {
                    retry += 1;
                    if (retry > 3) {
                        rj(e);
                        break;
                    }
                    await Util.sleep(2000);
                }
            }
        });
    }

    static async filterLegitimateUsersForCrawling(users, _mongoCollection = mongoCollection) {
        users = Array.from(new Set(users));
        let newUsers = [];
        for (const i in users) {
            let user = users[+i];
            let staleState = await CrawlerManager.checkStaleUserTask(user, _mongoCollection);
            if (staleState == undefined) newUsers.push(user);
            if (staleState) {
                try {  // try cancelling task for stale user
                    let workerResponse = await Util.sendHttpRequest('post', { 'users': [user] }, host + ':' + r.worker, '/stop_crawling_users');
                }
                catch (e) { }; //worker may be dead or already cancelled the failed task
                newUsers.push(user);
            }
        }
        return newUsers;
    }

    static async checkStaleUserTask(user, _mongoCollection = mongoCollection) {
        let r = await _mongoCollection.findOne({ '_id': '' + user });
        if (!r) return undefined;
        return (((Date.now() - r['lastCrawlTime']) / 1000 > conf.crawlerTimeoutSeconds) ? true : false);
    }

    static async getFragments(arr, fragmentSize) {
        let arrChunks = [];
        while (1) {
            let a = arr.slice(0, fragmentSize), _ = arr.slice(fragmentSize);
            if (a.length > 0) arrChunks.push(a); arr = _;
            if (arr.length <= 0) break;
        }
        return arrChunks;
    }

    static async sendNewUserCrawlTasksToExistingWorkers(users, intervalSec) {
        Object.keys(workerStatus).forEach(async worker => {
            let freeSpace = conf.crawlerWorkerLimit - workerStatus[worker];
            if (freeSpace > 0) {
                let usersToSend = users.slice(0, freeSpace);
                users = users.slice(freeSpace);
                await this.sendTaskToWorker({ 'users': usersToSend, 'intervalSec': intervalSec }, worker);
            }
        });
        return users;
    }

    static async sendCrawlingTasksChunksToNewWorkers(userChunks, intervalSec) {
        return userChunks.map(async userChunk => {
            workerIDIter += 1;
            let _ = await CrawlerManager.startNewWorker(workerIDIter, conf.pushgatewayService);
            return await CrawlerManager.sendTaskToWorker({ 'users': userChunk, 'intervalSec': intervalSec }, workerIDIter);
        })
    }
}

module.exports.CrawlerManager = CrawlerManager;

app.get('/', (req, res) => {
    res.send({
        'GET': ['get_task_count', 'get_worker_count'],
        'POST': ['start_crawling_users', 'stop_crawling_users'],
    });
});

app.post('/start_crawling_users', async (req, res) => {
    let users = await CrawlerManager.filterLegitimateUsersForCrawling(req.body['users']);
    let leftoverUsers = await CrawlerManager.sendNewUserCrawlTasksToExistingWorkers(users, req.body.intervalSec);
    let userChunks = await CrawlerManager.getFragments(leftoverUsers, conf.crawlerWorkerLimit);
    let workersResponses = await CrawlerManager.sendCrawlingTasksChunksToNewWorkers(userChunks, req.body.intervalSec);
    Promise.all(workersResponses).then((v) => {
        res.send('Tasks started.');
    });
});


(
    async () => {
        mongoCollection = await Util.getMongoCollectionPromise();
        Routines.updateSuspiciousStatusInterval();
        app.listen(port, () => console.log('crawlerManager listening on port ' + port));
    }
)()