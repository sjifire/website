// const chai = require("chai");
// const assert = chai.assert;
// // const fs = require('fs')
// // const _ = require('lodash')
// const nextBoardMeetingDate = require("../src/modules/next_board_meeting_date");

// const { set, reset } = require("mockdate");

// // const winston = require('winston')

// // NOTE: if you want to enable debugging while running a test, add
// // winston.level = 'debug'
// // and it will become quite verbose

// describe("nextBoardMeetingDate which is the 2nd tuesday of every month", function () {
//   afterEach(() => {
//     reset();
//   });

//   it("should find the 2nd tuesday if on the first of the year", function () {
//     set("2022-01-01");
//     assert.equal(nextBoardMeetingDate().toLocaleDateString(), "1/11/2022");
//   });

//   it("should find the 2nd tuesday if on the monday before the 2nd tuesday", function () {
//     set("2022-01-10");
//     assert.equal(nextBoardMeetingDate().toLocaleDateString(), "1/11/2022");
//   });

//   it("should stay on the 2nd tuesdady if the date is the 2nd tuesday", function () {
//     set("2022-01-11");
//     assert.equal(nextBoardMeetingDate().toLocaleDateString(), "1/11/2022");
//   });

//   it("should go to the next month if past the 2nd tuesdady", function () {
//     set("2022-01-12");
//     assert.equal(nextBoardMeetingDate().toLocaleDateString(), "2/8/2022");

//     set("2022-02-9");
//     assert.equal(nextBoardMeetingDate().toLocaleDateString(), "3/8/2022");
//   });

//   it("should be able to find the 2nd tuesday when it is the 8th day of the month", function () {
//     [
//       "2022-02-01",
//       "2022-02-02",
//       "2022-02-03",
//       "2022-02-04",
//       "2022-02-05",
//       "2022-02-06",
//       "2022-02-07",
//     ].forEach((date) => {
//       set(date);
//       assert.equal(nextBoardMeetingDate().toLocaleDateString(), "2/8/2022");
//     });
//   });

//   it("should not have an issue with a leap year", function () {
//     [
//       "2020-02-01",
//       "2020-02-02",
//       "2020-02-03",
//       "2020-02-04",
//       "2020-02-05",
//       "2020-02-06",
//       "2020-02-07",
//       "2020-02-08",
//       "2020-02-09",
//       "2020-02-10",
//     ].forEach((date) => {
//       set(date);
//       assert.equal(nextBoardMeetingDate().toLocaleDateString(), "2/11/2020");
//     });

//     set("2020-02-12");
//     assert.equal(nextBoardMeetingDate().toLocaleDateString(), "3/10/2020");
//   });
// });
