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

async function startNewWorker(wID, dest) {
    return Util.startNewChildProcess('node', ['--max_old_space_size=8192',
        '--optimize_for_size', '--stack_size=4096', '--nouse-idle-notification',
        './crawler/crawlerWorker.js', wID, dest]);
}

async function sendTaskToWorker(body, worker) {
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


app.get('/', (req, res) => {
    res.send({
        'GET': ['get_task_count', 'get_worker_count'],
        'POST': ['start_crawling_users', 'stop_crawling_users'],
    });
});

app.post('/start_crawling_users', async (req, res) => {
    let users = Array.from(new Set(req.body['users']));
    let newUsers = [];
    for (const i in users) {
        let user = users[+i]
        let r = await mongoCollection.findOne({ '_id': '' + user });
        if (!r) newUsers.push(user);
        else if ((Date.now() - r['lastCrawlTime']) / 1000 > conf.crawlerTimeoutSeconds) {  //stale updates
            try {  // try cancelling task for stale user
                let workerResponse = await Util.sendHttpRequest('post', { 'users': [user] }, host + ':' + r.worker, '/stop_crawling_users');
            }
            catch (e) { } // the worker may already have stopped the task, or nonexistent
            newUsers.push(user);
        }
    }
    users = newUsers;
    Object.keys(workerStatus).forEach(async worker => {
        let freeSpace = conf.crawlerWorkerLimit - workerStatus[worker];
        if (freeSpace > 0) {
            let usersToSend = users.slice(0, freeSpace);
            users = users.slice(freeSpace);
            await sendTaskToWorker({ 'users': usersToSend, 'intervalSec': req.body['intervalSec'] }, worker);
        }
    });
    // left overs
    let userChunks = [];
    while (1) {
        let a = users.slice(0, conf.crawlerWorkerLimit), _ = users.slice(conf.crawlerWorkerLimit);
        if (a.length > 0) userChunks.push(a); users = _;
        if (users.length <= 0) break;
    }

    Promise.all(userChunks.map(async userChunk => {
        workerIDIter += 1;
        await startNewWorker(workerIDIter, conf.pushgatewayService).then(v => {
            return sendTaskToWorker({ 'users': userChunk, 'intervalSec': req.body['intervalSec'] }, workerIDIter);
        });
    })).then((v) => {
        res.send('Tasks started.');
    });
});

(
    async () => {
        mongoCollection = !mongoCollection ? await Util.getMongoCollectionPromise() : mongoCollection;
        Routines.updateSuspiciousStatusInterval();
        app.listen(port, () => console.log('crawlerManager listening on port ' + port));
    }
)()