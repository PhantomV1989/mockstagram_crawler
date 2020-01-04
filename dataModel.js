// centralized data model
const conf = require('./config');
const Util = require('./commonUtil').Util;
let mongoCollection = undefined;

class DataModel {
    static async getAllUsers() {
        return ThanosHelper.getAllUsers();
    }

    static async getUserFirstData(user) {
        // user in string
        mongoCollection = !mongoCollection ? await Util.getMongoCollectionPromise() : mongoCollection;
        let findRes = await mongoCollection.findOne({ '_id': user });
        if (findRes) {
            let firstStartedTime = Math.round(findRes['firstStartedTime'] / 1000); // a range, -3 last digits
            let uncertaintyRange = firstStartedTime + 2 * conf.crawlerIntervalSeconds;
            return await ThanosHelper.getUserData(user, firstStartedTime, uncertaintyRange);
        }
        else {
            return undefined;
        }
    }

    static async getUserLastData(user) {
        mongoCollection = !mongoCollection ? await Util.getMongoCollectionPromise() : mongoCollection;
        let findRes = await mongoCollection.findOne({ '_id': user });
        if (findRes) {
            let lastCrawlTime = Math.round(findRes['lastCrawlTime'] / 1000); // a range, -3 last digits
            return await ThanosHelper.getUserData(user, lastCrawlTime, lastCrawlTime);
        }
        else {
            return undefined;
        }
    }

    static async getUserTimeseriesData(start, end, step = conf.crawlerIntervalSeconds) {
        // follower, following, ratio
    }
}

class ThanosHelper {
    static async getAllUsers() {
        //curl http://localhost:19192/api/v1/label/userid/values
        let _ = await Util.sendHttpRequest('get', {}, conf.thanosService, '/api/v1/label/userid/values');
        return _.data;
    }

    static async getUserData(user, start, end, step = conf.crawlerIntervalSeconds, metrics = undefined) {
        if (!metrics) metrics = ['following_count', 'follower_count', 'follower_ratio']
        let body = {
            'query': '{__name__=~"' + metrics.join('|') + '",userid="' + user + '"}',
            'start': start,
            'end': end,
            'step': step,
            'dedup': 'true',  // see Thanos documentation
            'partial_response': 'true',  // see Thanos documentation
        };
        let route = '/api/v1/query_range?query=%7B__name__%3D~%22' + metrics.join('%7C') + '%22%2Cuserid%3D%22' + user + '%22%7D&start=' + start + '&end=' + end + '&step=' + step + '&dedup=true&partial_response=true';
        let _ = await Util.sendHttpRequest('get', {}, conf.thanosService, route);
        let result = _.data.result;
        let returnBody = {};
        for (const i in result) {
            let epochTimePts = result[i].values.map(x => x[0]);
            let valuePts = result[i].values.map(x => x[1]);
            returnBody[result[i].metric.__name__] = { 'time': epochTimePts, 'value': valuePts };
        }
        return returnBody;
    }
}

module.exports.DataModel = DataModel;
