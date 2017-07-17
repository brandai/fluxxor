var _ = require("lodash");

var Store = require("./store");
var inherits = require("./util/inherits");

var RESERVED_KEYS = ["flux", "waitFor"];

var createStore = function(spec) {
  _.forEach(RESERVED_KEYS, function(key) {
    if (spec[key]) {
      throw new Error("Reserved key '" + key + "' found in store definition");
    }
  });

  var constructor = function(options) {
    options = options || {};
    Store.call(this);

    for (var key in spec) {
      if (key === "actions") {
        this.bindActions(spec[key]);
      } else if (key === "initialize") {
        // do nothing
      } else if (_.isFunction(spec[key])) {
        this[key] = spec[key].bind(this);
      } else {
        this[key] = spec[key];
      }
    }

    if (spec.initialize) {
      spec.initialize.call(this, options);
    }
  };

  inherits(constructor, Store);
  return constructor;
};

module.exports = createStore;
