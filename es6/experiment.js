import { shallowCopy, extend, isObject, forEach, map, trimTrailingWhitespace, getParameterByName } from './lib/utils';

export default function provideExperiment(Assignment) {
  class Experiment {
    constructor(inputs, wasLogged) {
      this.inputs = inputs;
      this._exposureLogged = wasLogged || false;
      this._salt = null;
      this._inExperiment = true;
      this._autoExposureLog = true;

      this.setup();
      if (!this.name) {
        throw "setup() must set an experiment name via this.setName()";
      }

      this._assignment = new Assignment(this.getSalt());
      this._assigned = false;
    }

    /* default implementation of fetching the range of experiment parameters that this experiment can take */
    getDefaultParamNames() {
      var assignmentFxn = this.assign.toString();
      var possibleKeys = assignmentFxn.split('.set(');
      possibleKeys.splice(0, 1); //remove first index since it'll have the function definitions
      return map(possibleKeys, (val) => {
        var str = trimTrailingWhitespace(val.split(',')[0]);
        return str.substr(1, str.length-2); //remove string chars
      });
    }

    requireAssignment() {
      if (!this._assigned) {
        this._assign();
      }
    }

    async requireExposureLogging(paramName) {
      if (this.shouldLogExposure(paramName)) {
        return this.logExposure();
      }
    }

    _assign() {
      this.configureLogger();
      var assignVal = this.assign(this._assignment, this.inputs);
      if (assignVal || assignVal === undefined) {
        this._inExperiment = true;
      } else {
        this._inExperiment = false;
      }
      this._assigned = true;
    }

    setup() {
      throw "IMPLEMENT setup";
    }

    inExperiment() {
      return this._inExperiment;
    }

    addOverride(key, value) {
      this._assignment.addOverride(key, value);
    }

    setOverrides(value) {
      this._assignment.setOverrides(value);
      var o = this._assignment.getOverrides();
      var self = this;
      forEach(Object.keys(o), function(key) {
        if (self.inputs[key] !== undefined) {
          self.inputs[key] = o[key];
        }
      });
    }

    setLocalOverride(name) {
      var experimentName = getParameterByName('experimentOverride');
      var overrideValue = getParameterByName(name);
      if (experimentName === this.name && overrideValue) {
        this.addOverride(name, overrideValue);
      }
    }

    getSalt() {
      if (this._salt) {
        return this._salt;
      } else {
        return this.name;
      }
    }

    setSalt(value) {
      this._salt = value;
      if (this._assignment) {
        this._assignment.experimentSalt = value;
      }
    }

    getName() {
      return this.name;
    }

    assign(params, args) {
      throw "IMPLEMENT assign";
    }

    /*
    This function should return a list of the possible parameter names that the assignment procedure may assign.
    You can optionally override this function to always return this.getDefaultParamNames()
    which will analyze your program at runtime to determine what the range of possible experimental parameters are.
    Otherwise, simply return a fixed list of the experimental parameters that your assignment procedure may assign.
    */

    getParamNames() {
      throw "IMPLEMENT getParamNames";
    }

    shouldFetchExperimentParameter(name) {
      const experimentalParams = this.getParamNames();
      return experimentalParams.indexOf(name) >= 0;
    }

    setName(value) {
      var re = /\s+/g;
      this.name = value.replace(re, '-');
      if (this._assignment) {
        this._assignment.experimentSalt = this.getSalt();
      }
    }

    __asBlob(extras={}) {
      var d = {
        'name': this.getName(),
        'time': new Date().getTime() / 1000,
        'salt': this.getSalt(),
        'inputs': this.inputs,
        'params': this._assignment.getParams()
      };
      extend(d, extras);
      return d;
    }

    setAutoExposureLogging(value) {
      this._autoExposureLog = value;
    }

    async getParams() {
      this.requireAssignment();
      await this.requireExposureLogging()
      return this._assignment.getParams();
    }

    async get(name, def) {
      this.requireAssignment();
      await this.requireExposureLogging(name);
      this.setLocalOverride(name);
      return this._assignment.get(name, def);
    }

    async toString() {
      this.requireAssignment();
      await this.requireExposureLogging();
      return JSON.stringify(this.__asBlob());
    }
    
    setExposureLogged() {
      this._exposureLogged = true;
    }

    async logExposure(extras) {
      if (!this.inExperiment()) {
        return;
      }
      this._exposureLogged = true;
      return this.logEvent('exposure', extras);
    }

    shouldLogExposure(paramName) {
      if (paramName !== undefined && !this.shouldFetchExperimentParameter(paramName)) {
        return false;
      }
      return this._autoExposureLog && !this.previouslyLogged();
    }

    logEvent(eventType, extras) {
      if (!this.inExperiment()) {
        return;
      }

      var extraPayload;

      if (extras) {
        extraPayload = { 'event': eventType, 'extra_data': shallowCopy(extras)};
      } else {
        extraPayload = { 'event': eventType };
      }

      return this.log(this.__asBlob(extraPayload));
    }

    configureLogger() {
      // Override if needed
    }

    async log(data) {
      throw "IMPLEMENT log";
    }

    previouslyLogged() {
      return this._exposureLogged;
    }
  }

  return Experiment;
}
