const http = require("http");
const conf = require('./config');
const agent = new http.Agent({ maxSockets: conf.crawlerNodeMaxSocket });
const childProcess = require('child_process');

const mongoClient = require('mongodb').MongoClient('mongodb://' + conf.mongodbService);

class Util {
    static async sendHttpRequest(type, body, addr_port, route, contentType = 'application/json') {
        // sendHttpRequest('post',{'a':1},'123.123.123.23','/a')
        addr_port = addr_port.split(':');
        let host = addr_port[0];
        let port = addr_port[1];
        return new Promise((re, rj) => {
            try {
                body = typeof body === 'string' ? body : JSON.stringify(body);
                let post_options = {
                    host: host,
                    port: port,
                    path: route,
                    method: type,
                    headers: {
                        'Content-Type': contentType,
                        'Content-Length': Buffer.byteLength(body)
                    },
                    agent: agent
                };
                let response = '';
                let postReq = http.request(post_options, function (res) {
                    res.setEncoding('utf8');
                    res.on('data', function (chunk) {
                        response += chunk;
                    });
                    res.on('end', () => {
                        try {
                            response = JSON.parse(response);
                            re(response);
                        } catch (e) {
                            re(response.toString());
                        }
                    });
                }).on('error', (e) => {
                    let error = {
                        'address': addr_port,
                        'route': route,
                        'error': e
                    };
                    rj(error);
                });
                postReq.setNoDelay();
                postReq.write(body);
                postReq.end();
            } catch (e) {
                rj(e);
            }
        });
    }

    static async sleep(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms)
        })
    }

    static async startNewChildProcess(cmd, args, supress = false) {
        return new Promise(async (rs, rj) => {
            let processStatus = await childProcess.spawn(cmd, args);
            processStatus.stdout.on('data', async (data) => {
                if (!supress) console.log('stdout: ' + data);
                rs(String(data));
            });
            processStatus.stderr.on('data', async (data) => {
                if (!supress) console.log('stderr: ' + data);
                rs(String(data));
            });
            processStatus.on('close', async (data) => {
                if (!supress) console.log('child process exited with' + data);
                rs(String(data));
            });
        })
    }

    static async getMongoCollectionPromise() {
        const mongoDbName = conf.mongoDbName;
        const mongoDbConnectionPromise = new Promise((rs, rj) => { mongoClient.connect((err, client) => { if (err) rj(err); rs(client.db(mongoDbName)); }); })
        const mongoCollectionPromise = new Promise(async (rs, rj) => {
            try {
                let db = await mongoDbConnectionPromise;
                rs(db.collection(conf.mongoCollection));
            }
            catch (e) { rj(e) };
        });
        return mongoCollectionPromise;
    }

    static async getAllUsersFromMongoDB(mongoCollection = undefined) { //may explode, share same DB connection if possible
        mongoCollection = !mongoCollection ? await this.getMongoCollectionPromise() : mongoCollection;
        let users = await mongoCollection.distinct('_id');
        return users;
    }
}

module.exports.Util = Util;