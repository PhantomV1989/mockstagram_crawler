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
        /** 
         * Starts new worker listening to port 'wID' and sending data to Prometheus node
         * with address 'dest'
         *  
         * wID, or workerID, is both the ID of worker and the port it is listening to.
         * 
         * Returns the promise of child process that starts the worker
        */        
        return Util.startNewChildProcess('node', ['--max_old_space_size=8192',
            '--optimize_for_size', '--stack_size=4096', '--nouse-idle-notification',
            './crawler/crawlerWorker.js', wID, dest]);
    }

    static async sendTaskToWorker(body, worker) {
        /**
         * Sends crawling tasks to worker.
         * body has the following format:  { 'users': [1000001, 1996161, 1787381], 'intervalSec': 5 }
         * worker is the workerID or worker port number it is listening to
         * Returns a Promise that resolves when receiving a response, no matter successful or not.
         */
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
        /**
         * Does a series of checks for users being requested for crawling
         * users, an array of :pk's: [1000001, 1996161, 1787381]
         * _mongoCollection, reused opened mongodb's collection connection. Exposed as an argument for 
         * ease of testing in a different collection
         * Returns an array of legitimate users
         */
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
        /**
         * checks for stale users, ie users whose last successful update time is too old, 
         * as specified by conf.crawlerTimeoutSeconds
         * user, :pk value, : 1000001
         * _mongoCollection, reused opened mongodb's collection connection.
         * Returns boolean, true if stale, false otherwise
         */
        let r = await _mongoCollection.findOne({ '_id': '' + user });
        if (!r) return undefined;
        return (((Date.now() - r['lastCrawlTime']) / 1000 > conf.crawlerTimeoutSeconds) ? true : false);
    }

    static async getFragments(arr, fragmentSize) {
        /**
         * Fragments an array into chunks of size fragmentSize. For use of work allocation 
         * to multiple workers.
         */
        let arrChunks = [];
        while (1) {
            let a = arr.slice(0, fragmentSize), _ = arr.slice(fragmentSize);
            if (a.length > 0) arrChunks.push(a); arr = _;
            if (arr.length <= 0) break;
        }
        return arrChunks;
    }

    static async sendNewUserCrawlTasksToExistingWorkers(users, intervalSec) {
        /**
         * Sends crawling tasks to existing users by calculating their free space.
         * users, an array of :pk's: [1000001, 1996161, 1787381]
         * intervalSec, crawling interval in seconds
         * Returns leftover users not allocated to any existing workers.
         */
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
        /**
         * Sending userChunks to new workers, by first creating these workers, then sending tasks over.
         * userChunks, a nested array of :pk's: [[1000001, 1996161], [1000021, 1996121]]
         * intervalSec, crawling interval in seconds
         * Returns an array of Promises from new workers.
         */
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