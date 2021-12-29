const assert = require('assert');
const fs = require('fs');
const _  = require('underscore');
const esoScraper = require( "../src/modules/eso_scraper" );
const sampleCSVPath = `${__dirname}/files/sample_report.csv`;
// const sampleJSONPath = `${__dirname}/sample_stats.json`;
// const sampleJSON = fs.readFileSync('sample_stats.json', "utf8");

describe('parseCSV', function(){
  let records = null;
  let record  = null

  before(() => {
    records = esoScraper.parseCSV(sampleCSVPath);
    record  = records[0];
  });

  it('should return expected number of records', function(){
    assert.equal(records.length, 3063)
  });

  it('should return an array of objects', function(){
    assert.equal(typeof(record), 'object')
  });

  it('should contain multiple personnel for each incident', function(){
    let recordsWithMultiplePersonnel = _.filter(records, function(r){
      return r['Incident Number'] === '21-021224'
    })
    assert.equal(recordsWithMultiplePersonnel.length, 3)
    userIds = _.map(recordsWithMultiplePersonnel, 'User Login ID')
    assert.deepEqual(_.sortBy(userIds), [ 'bsevier', 'cmcconnell', 'mvondassow' ])
  });

  it('should contain multiple apparatus if they exist in an incident', function(){
    let recordsWithMultipleApparatus = _.filter(records, function(r){
      return r['Incident Number'] === '21-021228'
    })
    apparatusNames = _.map(recordsWithMultipleApparatus, 'Apparatus Name')
    assert.deepEqual(_.uniq(_.sortBy(apparatusNames)), [ 'E31', 'L31' ])
  })

  describe("record within array", function(){
    it('should contain the expected keys', function(){
      let recordFields = _.chain(record).keys().sort().value();
      let expectedFields = [
        'Alarm Date',
        'Apparatus Name',
        'Arrival Date',
        'Clear Date',
        'Dispatched Date',
        'En Route Date',
        'Incident Date',
        'Incident Number',
        'Incident Type Code',
        'Last Unit Cleared Date',
        'Station',
        'User Login ID'
      ]
      _.each(expectedFields, function(f){
        found = recordFields.indexOf(f) > -1
        assert.ok(found, `${f} not found in record`);
      })
    });

    it('should convert date columns into date objects', function(){
      let recordWithAllDates = records[10]
      dateFields = _.chain(record).keys().filter(function(k){return k.match(/\s+Date$/);}).value()
      _.each(dateFields, function(f){
        val = recordWithAllDates[f];
        assert.ok(_.isDate(val), `${f} is not a Date Object`);
      });
    });

    it('should set a date to null if it is not set in the csv', function(){
      let recordWithoutArrivalDate = records[0]
      assert.ok(_.isNull(recordWithoutArrivalDate['Arrival Date']), `'Arrival Date' should be set to null`)
    });
  });

});

//TODO: focus on edge case stats
describe('generateStats', function(){
  let records = null;
  let statsJSON = null;
  // let stubbedStats = null;
  let parsedStats  = null;
  before(() => {
    records = esoScraper.parseCSV(sampleCSVPath);
    parsedStats = esoScraper.generateStats(records);
  });
  it('should return expected keys', function(){
    let statFields = _.chain(parsedStats).keys().sort().value();
    let keys = Object.keys(parsedStats);
    assert.ok(keys.includes('apparatus_stats'));
    assert.ok(keys.includes('call_stats'));
    assert.ok(keys.includes('personnel_stats'));
    assert.ok(keys.includes('region_stats'));
    assert.ok(keys.includes('time_stats'));
    assert.ok(keys.includes('updated_at'));
    assert.ok(keys.includes('date_range_from'));
    assert.ok(keys.includes('date_range_to'));
  });
  it('should return expected call_stats', function(){
    let expectedCallStats = {
      medical_rescue: 54,
      fire: 6,
      total: 0,
      downgraded: 7,
      cancelled: 11,
      other: 0,
      total_calls: 78,
      daytime_calls: 55,
      nighttime_calls: 23,
      overlapping_num_calls: 9,
      total_calls_last_365_days: 1000,
      per_day: { mean: 2.6, median: 2, min: 0, max: 6 }
    }
    assert.deepStrictEqual(parsedStats.call_stats, expectedCallStats);
  });
  it('should return expected personnel_stats', function(){
    let expectedPersonnelStats = {
      time_on_incident: {
        sum: 413894,
        mean: 5306.333333333333,
        median: 4400,
        min: 60,
        max: 20624
      },
      number_per_incident: { mean: 2.3461538461538463, median: 2, max: 6 },
      number_unique_responders: 22
    }
    assert.deepStrictEqual(parsedStats.personnel_stats, expectedPersonnelStats);
  });

  it('should return expected region_stats', function(){
    let expectedRegionStats = {
      central: {
        call_types: {
          medical_rescue: 39,
          fire: 5,
          total: 56,
          downgraded: 5,
          cancelled: 7,
          other: 0
        },
        travel: {
          sum: 16513.533333333333,
          mean: 344.03194444444443,
          median: 274,
          min: 84,
          max: 1009
        }
      },
      north: {
        call_types: {
          medical_rescue: 7,
          fire: 1,
          total: 11,
          downgraded: 0,
          cancelled: 3,
          other: 0
        },
        travel: {
          sum: 10549,
          mean: 1172.111111111111,
          median: 1106,
          min: 943,
          max: 1672
        }
      },
      south: {
        call_types: {
          medical_rescue: 8,
          fire: 0,
          total: 11,
          downgraded: 2,
          cancelled: 1,
          other: 0
        },
        travel: {
          sum: 8240,
          mean: 749.0909090909091,
          median: 803,
          min: 141,
          max: 1257
        }
      }
    }
    assert.deepStrictEqual(parsedStats.region_stats, expectedRegionStats);
  });

//   it('should return expected time_stats', function(){
//     let expectedTimeStats = {
//       on_scene: {
//         mean: 3216.939393939394
//       },
//       reaction: {
//         mean: 82.92424242424242
//       }
//     }
//     assert.deepStrictEqual(parsedStats.time_stats, expectedTimeStats);
//   });
});

