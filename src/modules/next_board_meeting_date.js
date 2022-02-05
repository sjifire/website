"use strict";

// The next board meeting is the
const nextBoardMeetingDate = function (
  month = new Date().getMonth(),
  day = new Date().getDate()
) {
  const temp = new Date();
  temp.setMonth(month, day);
  // remember, getDate(): 1-31
  //           getDay(): 0-6 sun-sat
  let n = 7; // start in 2nd week; earliest it can be is the 8th!
  temp.setDate(n);
  while (temp.getDay() !== 2) {
    temp.setDate(n++);
    // console.log(` ${n} - ${temp.getDay()} - ${temp.getDate()} -- ${temp}`)
  }
  // console.log(` ${day}>${temp.getDate()}`)
  if (day > temp.getDate()) {
    const nextMonth = temp.getMonth() + 1;
    // console.log(`  month: ${nextMonth}`)
    // everything is zero-indexed EXCEPT date; that starts with 1
    // as the first of the month.  If you set this to 0, it goes to
    // the last day of the previous month
    return nextBoardMeetingDate(nextMonth, 1);
  }
  return temp;
};

module.exports = nextBoardMeetingDate;
