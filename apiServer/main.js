const body_parser = require("body-parser");
const app = require('express')();
const conf = require('../config');
const util = require('../commonUtil');
const host = conf.crawlerHost;
const port = conf.crawlerManagerPort;

app.use(body_parser.json());

app.get('/', (req, res) => {
    res.send({
        'GET': ['?', '?'],
        'POST': ['?', '?'],
    });
});

app.get('/averages', async (req, res) => {
    res.send({});
});

app.post('/stop_crawling_users', (req, res) => {
    res.send('Crawling tasks stopped.');
});

(
    async () => {
        app.listen(port, () => console.log('crawlerManager listening on port ' + port));
    }
)()