// for jasmine, integration tests. Warning, this uses the test platform. 
// Most features have external dependencies, hard to unit test
const conf = require('../config');
const Util = require('../commonUtil').Util;
const CrawlerManager = require('./crawlerManager').CrawlerManager;

async function addStaleUser(collection, user) {
    return await collection.updateOne({ '_id': '' + user }, {
        '$set':
        {
            "avgFollower": 23337,
            "avgFollowing": 150,
            "currentCount": 1,
            "firstStartedTime": 1578319854158,
            "lastCrawlTime": 1578319856160,
            "username": "influencer-1000001",
            "worker": "30001"
        }
    }, { upsert: true });
}

describe("Crawler Manager:", () => {
    let collectionPromise = Util.getMongoCollectionPromise(conf.mongoDbName, 'testUserData');
    let collection = undefined;
    let testUser = 1000001;

    // Clearing out testUserData collection for testing
    beforeEach(async () => {
        collection = await collectionPromise;
        await collection.deleteOne({ '_id': '' + testUser });
    });

    describe("Misc:", () => {
        it("getFragments", async () => {
            let fragments = await CrawlerManager.getFragments([...Array(100).keys()], 10);
            let _ = Array.from(new Set(fragments.map(x => x.length)));
            expect(fragments.length == 10 && _.length == 1 && _.shift() == 10).toBe(true);
        });
    });

    describe("When filtering for legitimate users,", () => {
        it("it should be able to remove duplicates", async () => {
            let legitUsers = await CrawlerManager.filterLegitimateUsersForCrawling([1000001, 1000001, 1000001], collection);
            expect(legitUsers.length).toEqual(1);
        });

        it("it should be able to find stale users", async () => {
            await addStaleUser(collection, testUser);
            let legitUsers = await CrawlerManager.checkStaleUserTask(testUser, collection);
            expect(legitUsers).toBe(true);
        });

        it("it should be able to add stale users to legit users for crawling", async () => {
            await addStaleUser(collection, testUser);
            let legitUsers = await CrawlerManager.filterLegitimateUsersForCrawling([1000001], collection);
            expect(legitUsers.length).toEqual(1);
        });
    });
});