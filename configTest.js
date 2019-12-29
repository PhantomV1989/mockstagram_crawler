let mockstagramApiService = 'localhost:3000';
module.exports.mockstagramApiService = mockstagramApiService;

let crawlerHost = 'localhost';
let crawlerWorkerPort = '6346';
let crawlerService = crawlerHost + ':' + crawlerWorkerPort;
module.exports.crawlerWorkerPort = crawlerWorkerPort;
module.exports.crawlerService = crawlerService;

let apiHost = 'localhost';
let thanosService = 'localhost:ip';
let mongodbService = 'localhost:ip';
let redisService = 'localhost:ip';




module.exports.apiHost = apiHost;
module.exports.thanosService = thanosService;
module.exports.mongodbService = mongodbService;
module.exports.redisService = redisService;