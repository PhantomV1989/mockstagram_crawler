module.exports.mockstagramApiService = '192.168.1.1:3000';
module.exports.prometheusService = '192.168.1.1:9090';



let crawlerHost = '192.168.1.1';
let crawlerManagerPort = 40000; //40k range and above for workers
let crawlerService = crawlerHost + ':' + crawlerManagerPort;
let crawlerWorkerLimit = 200;
module.exports.crawlerHost = crawlerHost;
module.exports.crawlerManagerPort = crawlerManagerPort;
module.exports.crawlerService = crawlerService;
module.exports.crawlerWorkerLimit = crawlerWorkerLimit;

let apiHost = '192.168.1.1';
let thanosService = '192.168.1.1:ip';
let mongodbService = '192.168.1.1:ip';
let redisService = '192.168.1.1:ip';




module.exports.apiHost = apiHost;
module.exports.thanosService = thanosService;
module.exports.mongodbService = mongodbService;
module.exports.redisService = redisService;