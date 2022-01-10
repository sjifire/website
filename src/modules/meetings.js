
// export function sayHi(user) {
//   alert(`Hello, ${user}!`);
// }
// import {sayHi} from './sayHi.js';
const nextCommissionersMeeting = function(month = new Date().getMonth(), day = new Date().getDate()){
  var temp = new Date();
  temp.setMonth(month, day);
  // n must start at 1, but setDate is n++...
  // we need to set the date and THEN increment n
  var n = temp.getDate();
  while(temp.getDay()!= 2){
console.log(` ${n} - ${temp.getDay()}`)
    temp.setDate(++n);
  }
  // temp.setDate(n+7);
console.log(` ${day}>${temp.getDate()}`)
  if(day>temp.getDate()){
    var nextMonth=temp.getMonth()+1;
console.log(`  month: ${nextMonth}`)
    // everything is zero-indexed EXCEPT date; that starts with 1
    // as the first of the month.  If you set this to 0, it goes to
    // the last day of the previous month
    return nextSecondTuesday(nextMonth, 1);
  }
  return temp.toLocaleDateString();
};

module.exports=nextCommissionersMeeting;
