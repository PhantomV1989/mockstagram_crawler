const body_parser = require("body-parser");
const app = require('express')();
const conf = require('../config');
const util = require('../commonUtil');
const host = conf.crawlerHost;
const port = conf.crawlerManagerPort;
const childProcess = require('child_process');
const fs = require('fs')
const path = require('path');


let workerStatus = {};
let workerCount = 0;
let targets = [];

app.use(body_parser.json());

function updatePromTargets() {
    let filePath = path.join(path.dirname(__dirname), 'prometheus/targets.json');

    fs.readFile(filePath, { encoding: 'utf-8' }, (err, data) => {
        if (!err) {
            let content = JSON.parse(data);
            content[0]['targets'] = targets;
            content = JSON.stringify(content);
            fs.writeFile(filePath, content, (e) => {
                if (err) throw err;
                childProcess.spawn('curl', ['-X', 'POST', conf.prometheusService + '/-/reload']);
            });
        } else {
            console.log(err);
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
    if (workerCount == 0) {
        workerCount += 1;
        while (1) { //iter through avail port numbers
            try {
                let processStatus = await childProcess.spawn('node', ['./crawler/crawlerWorker.js', port + workerCount]);
                processStatus.stdout.on('data', function (data) {
                    console.log('stdout: ' + data);
                    let workerSvc = host + ':' + (port + workerCount);
                    if (!(workerSvc in targets)) {
                        targets.push(workerSvc);
                        updatePromTargets();
                    };
                });
                processStatus.stderr.on('data', function (data) {
                    console.log('stderr: ' + data);
                });
                processStatus.on('close', function (code) {
                    console.log('child process exited with code ' + code);
                });
                break;
            } catch (e) {
                workerCount += 1;
                continue;
            }
        }
    }
    else {
        // check current 
        let workerSvc = host + ':' + (port + workerCount);
        let taskCountRes = await util.sendHttpRequest('get', {}, workerSvc, '/get_task_count');
        if (taskCountRes['task_count'] < conf.crawlerWorkerLimit) {
            let workerStatus = await util.sendHttpRequest('post', req.body, workerSvc, '/start_crawling_users');
            res.send(workerStatus);
        }
    }
    let retry = 0;
    while (1) {
        try {
            let workerStatus = await util.sendHttpRequest('post', req.body, host + ':' + (port + workerCount), '/start_crawling_users');
            res.send(workerStatus);
            break;
        } catch (e) {
            retry += 1;
            await setTimeout(async () => await {}, 2000);
        }
    }
});

app.post('/stop_crawling_users', (req, res) => {
    res.send('Crawling tasks stopped.');
});


(
    async () => {
        app.listen(port, () => console.log('crawlerWorker listening on port ' + port));
    }
)()