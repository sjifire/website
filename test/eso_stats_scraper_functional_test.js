const assert = require('assert');
const fs = require('fs');
const esoScraper = require( "../src/modules/eso_scraper" );
const sampleCSVPath = `${__dirname}/sample_report.csv`;
// const sampleJSONPath = `${__dirname}/sample_stats.json`;
// const sampleJSON = fs.readFileSync('sample_stats.json', "utf8");

describe('parseCSV', function(){
  let records = null;
  before(() => {
    records = esoScraper.parseCSV(sampleCSVPath);
  });
  it('should return expected number of records', function(){
    assert.equal(records.length, 66)
  });
  it('should return an array of objects', function(){
    assert.equal(typeof(records[0]), 'object')
  });
  describe("record within array", function(){
    it('should contain a "Dispatched Date"', function(){
      assert.deepStrictEqual(records[0]['Dispatched Date'], new Date('2021-01-01T01:48:04.000Z'))
    });
    it('should contain a "En Route Date"', function(){
      assert.deepStrictEqual(records[0]['En Route Date'], new Date('2021-01-01T01:50:04.000Z'))
    });
    it('should contain a "Arrival Date"', function(){
      assert.deepStrictEqual(records[0]['Arrival Date'], new Date('2021-01-01T01:54:22.000Z'))
    });
    it('should contain a "Last Unit Cleared Date"', function(){
      assert.deepStrictEqual(records[0]['Last Unit Cleared Date'], new Date('2021-01-01T02:13:53.000Z'))
    });

    it('should contain a "EMS Personnel Count"', function(){
      assert.equal(records[0]['EMS Personnel Count'], 0)
    });
    it('should contain a "Other Personnel Count"', function(){
      assert.equal(records[0]['Other Personnel Count'], 0)
    });
    it('should contain a "Suppression Personnel Count"', function(){
      assert.equal(records[0]['Suppression Personnel Count'], 2)
    });

    it('should contain a "Incident Type Code"', function(){
      assert.equal(records[0]['Incident Type Code'], 321)
    });
    it('should contain a "Station"', function(){
      assert.equal(records[0]['Station'], '(31) Headquarters')
    });
  });
});

describe('generateStats', function(){
  let records = null;
  let statsJSON = null;
  // let stubbedStats = null;
  let parsedStats  = null;
  before(() => {
    records = esoScraper.parseCSV(sampleCSVPath);
    parsedStats = esoScraper.generateStats(records);
    // let rawdata = fs.readFileSync(sampleJSONPath);
    // stubbedStats = JSON.parse(rawdata);
  });
  it('should return expected keys', function(){
    let keys = Object.keys(parsedStats);
    assert.ok(keys.includes('call_stats'));
    assert.ok(keys.includes('personnel_stats'));
    assert.ok(keys.includes('region_stats'));
    assert.ok(keys.includes('time_stats'));
    assert.ok(keys.includes('updated_at'));
  });
  it('should return expected call_stats', function(){
    let expectedCallStats = {
          medical_rescue: 54,
          fire: 6,
          downgraded: 6,
          cancelled: 0,
          other: 0,
          daytime_calls: 45,
          nighttime_calls: 21,
          overlapping_num_calls: 8,
          total: 66
        }
    assert.deepStrictEqual(parsedStats.call_stats, expectedCallStats);
  });
  it('should return expected personnel_stats', function(){
    let expectedPersonnelStats = {
         "number_per_incident": {
           "max": 10,
           "mean": 2.5606060606060606,
           "min": 2,
         },
         "time_on_incident": {
           "mean": 4611.363636363636,
           "sum": 304350
         }
       }
    assert.deepStrictEqual(parsedStats.personnel_stats, expectedPersonnelStats);
  });

  it('should return expected personnel_stats', function(){
    let expectedRegionStats = {
          central: {
            travel: {
              mean: 334.1363636363636
            }
          },
          north: {
            travel: {
              mean: 1142.25
            }
          },
          south: {
            travel: {
              mean: 709.0909090909091
            }
          }
       }
    assert.deepStrictEqual(parsedStats.region_stats, expectedRegionStats);
  });

  it('should return expected time_stats', function(){
    let expectedTimeStats = {
      on_scene: {
        mean: 3216.939393939394
      },
      reaction: {
        mean: 82.92424242424242
      }
    }
    assert.deepStrictEqual(parsedStats.time_stats, expectedTimeStats);
  });
});

