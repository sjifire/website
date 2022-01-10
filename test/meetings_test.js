const chai = require('chai');
const assert = chai.assert;
const fs = require('fs');
const _  = require('lodash');
const {nextCommissionersMeeting} = require("../src/modules/meetings");

const { set, reset } = require('mockdate')

winston = require('winston');

// NOTE: if you want to enable debugging while running a test, add
// winston.level = 'debug'
// and it will become quite verbose


describe('nextCommissionersMeeting', function(){

  afterEach(() => {
    reset()
  })

  it('should find the next meeting if first of the year', function(){
    const date = '2021-01-01'
    set(date)
    assert.equal(nextCommissionersMeeting, '1/11/2021');
  })

});

