const body_parser = require("body-parser");
const app = require('express')();
const conf = require('../config');
const util = require('../commonUtil');


let crawlingTasks = {};
let taskCount = 0; // ~200

function crawlingTaskInterval(user, intervalSeconds) {
    // not meant to be resolved
    return setInterval(async () => {
        if (crawlingTasks[user]['cancellationToken']) {
            clearInterval(crawlingTasks[user]['task']);
            delete crawlingTasks[user];
            taskCount -= 1;
        } else {
            let res = await util.sendHttpRequest('get', {}, conf.mockstagramApiService, '/api/v1/influencers/' + user);
            if ('error' in res) {
                crawlingTasks[user]['cancellationToken'] = true;
                console.log(user + ' error:', res['error']);
            } else {
                crawlingTasks[user]['followerCount'] = res['followerCount'];
                crawlingTasks[user]['followingCount'] = res['followingCount'];
                crawlingTasks[user]['lastUpdated'] = Date.now();
                crawlingTasks[user]['state'] = 'running';
                crawlingTasks[user]['scrape'] = [
                    'follower_count{userid="' + user + '"} ' + res['followerCount'],
                    'following_count{userid="' + user + '"} ' + res['followingCount'],
                ];
            }
        }
    }, intervalSeconds * 1000);
}

function startUserCrawlingTask(userID, intervalSeconds) {
    if (!(userID in crawlingTasks)) { //avoid duplicate tasks
        crawlingTasks[userID] = {
            'intervalSeconds': intervalSeconds,
            'followerCount': 0,
            'followingCount': 0,
            'lastUpdated': 0,
            'state': 'starting',
            'cancellationToken': false,
            'task': crawlingTaskInterval(userID, intervalSeconds)
        };
        taskCount += 1;
        return 'Task started';
    } else {
        return 'Task already started';
    }
}

app.use(body_parser.json());

app.get('/', (req, res) => {
    res.send({
        'GET': ['get_task_count'],
        'POST': ['start_crawling_users', 'stop_crawling_users'],
    });
});

app.get('/get_task_count', (req, res) => {
    res.send({
        'task_count': taskCount
    })
});

app.post('/start_crawling_users', async (req, res) => {
    if (Object.keys(req.body).length == 0) {
        res.send({
            'Error': 'Please use body format {"users":[1000001], "intervalS":5}'
        });
    } else {
        try {
            let users = req.body['users'];
            let intervalSeconds = req.body['intervalS'];
            let responses = users.map(x => x + ': ' + startUserCrawlingTask(x, intervalSeconds));
            res.send({
                'current_task_count': taskCount//responses
            });

        } catch (e) {
            res.send(e);
        }
    }

});

app.post('/stop_crawling_users', (req, res) => {
    if (Object.keys(req.body).length == 0) {
        res.send({
            'Error': 'Please use body format {"users":[1000001]}'
        });
    } else {
        try {
            let users = req.body['users'];
            users.forEach(x => {
                if (x in crawlingTasks) {
                    crawlingTasks[x]['cancellationToken'] = true;
                }
            });
        } catch (e) {
            res.send(e);
        }
    }
    res.send('Crawling tasks stopped.');
});

app.get('/metrics', (req, res) => { // standard metrics scrapping format, ~ 200 users buffer
    let scrapeContent = [];
    Object.keys(crawlingTasks).forEach(x => {
        let userLatestData = crawlingTasks[x];
        if (userLatestData['state'] == 'running') { //go_gc_duration_seconds{quantile="1"} 0.000527106
            scrapeContent = scrapeContent.concat(userLatestData['scrape']);
        }
    });
    res.send(scrapeContent.join('\n') + '\n');
});

(
    async () => {
        app.listen(process.argv[2], () => console.log('crawlerWorker listening on port ' + process.argv[2]));
    }
)()