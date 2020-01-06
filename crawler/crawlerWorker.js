const body_parser = require("body-parser");
const app = require('express')();
const conf = require('../config');
const Util = require('../commonUtil').Util;

let crawlingTasks = {};
let taskCount = 0; // ~2000 to 3000
let port = 0;
let pushgatewayService = '';
let userCache = {};
let mongoCollection = undefined;

async function updateUsersInMongoInterval(intervalSeconds) {  //might be bottleneck, mongo uses eventual consistency, but about 3000 over 10s, so don't update so many times. Or use multi masters
    /**
     * This is for updating aggregated metrics (eg. average follower count).
     * The interval can be decided independently so we have the freedom to downsample these data 
     * so as to avoid unnecessary resource consumption.
     * This works by having an internal cache(called userCache) that suppose to reflect actual data
     * in the mongodb counterpart so as to avoid unnecessary queries.
     * It uses cache-aside policy, meaning it loads data from mongodb if there isnt any in the cache
     * then subsequently uses the cache as reference for future calculations
     * Returns interval id.
     */
    return setInterval(async () => {
        Object.keys(crawlingTasks).forEach(async user => {
            if (crawlingTasks[user]['followerCount'] > -1) {
                let currentCount = 0, avgFollower = 0, avgFollowing = 0, firstStartedTime = crawlingTasks[user]['startedTime'];
                if (user in userCache) {
                    currentCount = userCache[user]['currentCount'];
                    avgFollower = userCache[user]['avgFollower'];
                    avgFollowing = userCache[user]['avgFollowing'];
                } else {
                    let findRes = await mongoCollection.findOne({ '_id': user });
                    if (findRes) {
                        currentCount = findRes['currentCount'];
                        avgFollower = findRes['avgFollower'];
                        avgFollowing = findRes['avgFollowing'];
                        firstStartedTime = findRes['firstStartedTime'];
                        crawlingTasks[user]['startedTime'] = findRes['firstStartedTime'];
                    }
                };

                avgFollower = (avgFollower * currentCount + crawlingTasks[user]['followerCount']) / (currentCount + 1);
                avgFollowing = (avgFollowing * currentCount + crawlingTasks[user]['followingCount']) / (currentCount + 1);
                currentCount += 1;

                await mongoCollection.updateOne({ '_id': user }, {
                    '$set':
                    {
                        '_id': user,
                        'username': crawlingTasks[user]['username'],
                        'currentCount': currentCount,
                        'avgFollower': avgFollower,
                        'avgFollowing': avgFollowing,
                        'lastCrawlTime': crawlingTasks[user]['lastUpdated'],
                        'firstStartedTime': firstStartedTime,
                        'worker': port
                    }
                }, { upsert: true }).then((v) => {
                    userCache[user] = {
                        'currentCount': currentCount,
                        'avgFollower': avgFollower,
                        'avgFollowing': avgFollowing,
                    };
                }, (e) => {
                    console.log(e);
                });
            }
        })
    }, intervalSeconds * 1000)
}

async function pushDataInterval(intervalSeconds) {
    /**
     * This loop pushes data to Prometheus's pushgateway.
     * The pushing loop is separated from the crawling task because of
     * the way Prometheus handles data from endpoint. Pushing must be seen as a batch, or else 
     * independent pushes will result in Prometheus treating other data as missing
     * Returns interval id.
     */
    return setInterval(async () => {
        let scrapeContent = [
            '# TYPE follower_count gauge',
            '# TYPE following_count gauge',
            '# TYPE follower_ratio gauge',
        ];
        Object.keys(crawlingTasks).forEach(async x => {
            let userLatestData = crawlingTasks[x];
            let updatedTimeDifference = Math.round((Date.now() - userLatestData['lastUpdated']) / 1000);
            if (userLatestData['followerCount'] > -1 && updatedTimeDifference < conf.crawlerIntervalSeconds * 3) {
                scrapeContent.push('follower_count{userid="' + x + '"} ' + userLatestData['followerCount']);
                scrapeContent.push('following_count{userid="' + x + '"} ' + userLatestData['followingCount']);
                scrapeContent.push('follower_ratio{userid="' + x + '"} ' + userLatestData['followerCount'] / userLatestData['followingCount']);
            }
            else if (userLatestData['lastUpdated'] > -1 && updatedTimeDifference > conf.crawlerTimeoutSeconds) {
                userLatestData['cancellationToken'] = true;
            }

        });
        let body = scrapeContent.join('\n') + '\n';
        try {
            let res = await Util.sendHttpRequest('post', body, pushgatewayService, '/metrics/job/' + port, 'application/x-www-form-urlencoded');
        }
        catch (e) {
            if (e['error'].code != "ECONNRESET") throw e;  //intermittent connection
        }
    }, intervalSeconds);
}

function crawlingTaskInterval(user, intervalSeconds) {
    /**
     * Handles crawling for mockstagram endpoint. 
     * Also handles task cancellation via a token.
     */
    return setInterval(async () => {
        if (crawlingTasks[user]['cancellationToken']) {
            clearInterval(crawlingTasks[user]['task']);
            delete crawlingTasks[user];
            taskCount -= 1;
        } else {
            try {
                let res = await Util.sendHttpRequest('get', {}, conf.mockstagramApiService, '/api/v1/influencers/' + user);
                if ('error' in res) {
                    crawlingTasks[user]['cancellationToken'] = true;
                    console.log('Task cancelled ' + user + ' error:', res['error']);
                } else {
                    crawlingTasks[user]['username'] = res['username'];
                    crawlingTasks[user]['followerCount'] = res['followerCount'];
                    crawlingTasks[user]['followingCount'] = res['followingCount'];
                    crawlingTasks[user]['lastUpdated'] = Date.now();
                    crawlingTasks[user]['state'] = 'running';
                }
            }
            catch (e) {
                console.log(e);
            }
        }
    }, intervalSeconds * 1000);
}

function startUserCrawlingTask(user, intervalSeconds) {
    /**
     * The initiation of crawling tasks. This is done only once for each unique :pk value.
     * Keeps track of task status in a lookup table, crawlingTasks
     */
    if (!(user in crawlingTasks)) { //avoid duplicate tasks
        crawlingTasks[user] = {
            'intervalSeconds': intervalSeconds,
            'followerCount': -1,
            'followingCount': -1,
            'lastUpdated': -1,
            'state': 'starting',
            'cancellationToken': false,
            'task': crawlingTaskInterval(user, intervalSeconds),
            'startedTime': Date.now()
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

app.get('/get_current_tasks', (req, res) => {
    res.send({
        'tasks': Object.keys(crawlingTasks)
    })
});

app.post('/start_crawling_users', async (req, res) => {
    if (Object.keys(req.body).length == 0) {
        res.send({
            'Error': 'Please use body format {"users":[1000001], "intervalSec":5}'
        });
    } else {
        try {
            let users = req.body['users'];
            let intervalSeconds = req.body['intervalSec'];
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

(
    async () => {
        mongoCollection = await Util.getMongoCollectionPromise();
        port = process.argv[2];
        pushgatewayService = process.argv[3];
        pushDataInterval(conf.crawlerIntervalSeconds);
        updateUsersInMongoInterval(conf.crawlerIntervalSeconds * 2);  // 1 hour downsampling instead because i am using 1 node mongo, cant handle load atm.
        app.listen(process.argv[2], () => console.log('crawlerWorker listening on port ' + process.argv[2] + ', push target at ', pushgatewayService));
    }
)()