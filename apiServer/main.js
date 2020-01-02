const body_parser = require("body-parser");
const app = require('express')();
const conf = require('../config');
const util = require('../commonUtil');
const host = conf.crawlerHost;
const port = conf.crawlerManagerPort;
const childProcess = require('child_process');

let workerStatus = {};
let workerIDIter = port;
let userStatus = {};
let targets = new Set();

app.use(body_parser.json());

async function startNewWorker(wID) {
    return new Promise(async (rs, rj) => {
        let processStatus = await childProcess.spawn('node', ['--max_old_space_size=8192',
            '--optimize_for_size', '--stack_size=4096','--nouse-idle-notification',
            './crawler/crawlerWorker.js', wID]);
        processStatus.stdout.on('data', async (data) => {
            console.log('stdout: ' + data);
            let workerSvc = host + ':' + wID;
            if (!(workerSvc in targets)) {
                targets.add(workerSvc);
                rs(wID);
            };
        });
        processStatus.stderr.on('data', async (data) => {
            rs(String(data));
        });
        processStatus.on('close', async (data) => {
            console.log('child process exited with' + data);
            rs(wID);
        });
    })
}

async function sendTaskToWorker(body, worker) {
    let retry = 0;
    let workerSvc = host + ':' + worker;
    return new Promise(async (rs, rj) => {
        while (1) {
            try {
                let workerResponse = await util.sendHttpRequest('post', body, workerSvc, '/start_crawling_users');
                workerStatus[worker] = +(workerResponse['current_task_count']);
                rs(true);
                break;
            } catch (e) {
                retry += 1;
                if (retry > 3) {
                    rj(e);
                    break;
                }
                await util.sleep(2000);
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
    let users = Array.from(new Set(req.body['users'])).filter(x => !(x in userStatus));
    if (users.length > conf.crawlerUserLimitPerRequest) {
        res.send({ 'error': 'Too many users per request, please keep to <= 3000 users for each request' });
    }
    Object.keys(workerStatus).forEach(async worker => {
        let freeSpace = conf.crawlerWorkerLimit - workerStatus[worker];
        if (freeSpace > 0) {
            let usersToSend = users.slice(0, freeSpace);
            users = users.slice(freeSpace);
            await sendTaskToWorker({ 'users': usersToSend, 'intervalS': req.body['intervalS'] }, worker);
            usersToSend.forEach(x => userStatus[x] = worker);
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
        await startNewWorker(workerIDIter).then(v => {
            if (!isNaN(v)) return sendTaskToWorker({ 'users': userChunk, 'intervalS': req.body['intervalS'] }, v);
            else {
                console.log(v);
            }
        });
    })).then((v) => {
        res.send('Tasks started.');
    });
});

app.post('/stop_crawling_users', (req, res) => {
    res.send('Crawling tasks stopped.');
});

(
    async () => {
        app.listen(port, () => console.log('crawlerManager listening on port ' + port));
    }
)()