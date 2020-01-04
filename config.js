module.exports.mockstagramApiService = 'localhost:3000';

// crawler
let crawlerHost = 'localhost';// cant change ATM
let crawlerManagerPort = 30000; //30k range and above for workers
let crawlerService = crawlerHost + ':' + crawlerManagerPort;
let crawlerIntervalSeconds = 1;
let crawlerNodeMaxSocket = 15;
module.exports.crawlerIntervalSeconds = crawlerIntervalSeconds;
module.exports.crawlerHost = crawlerHost;
module.exports.crawlerManagerPort = crawlerManagerPort;
module.exports.crawlerService = crawlerService;
module.exports.crawlerWorkerLimit = crawlerNodeMaxSocket * 100;  // ~ 1.5k connections per node
module.exports.crawlerTimeoutSeconds = 60;  //
module.exports.crawlerNodeMaxSocket = crawlerNodeMaxSocket;

//api server
let apiHost = 'localhost';// cant change ATM
module.exports.apiHost = apiHost;

//pushgateway
let pushgatewayHost = 'localhost'// cant change ATM
let pushgatewayPort = 9091
module.exports.pushgatewayHost = pushgatewayHost;
module.exports.pushgatewayPort = pushgatewayPort;
module.exports.pushgatewayService = pushgatewayHost + ':' + pushgatewayPort;

//thanos
let thanosHost = 'localhost'// cant change ATM
let thanosPort = 19192
module.exports.thanosHost = thanosHost;
module.exports.thanosPort = thanosPort;
module.exports.thanosService = thanosHost + ':' + thanosPort;

//mongo
let mongoHost = 'localhost'  // cant change ATM
let mongoPort = 27018
let mongoDbName = 'mockstagram';
let mongoCollection = 'userData'
module.exports.mongoHost = mongoHost;
module.exports.mongoPort = mongoPort;
module.exports.mongodbService = mongoHost + ':' + mongoPort;
module.exports.mongoDbName = mongoDbName;
module.exports.mongoCollection = mongoCollection;