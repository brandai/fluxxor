var _ = require('lodash');

var defaultDispatchInterceptor = function(action, dispatch) {
  dispatch(action);
};

var Dispatcher = function(stores) {
  this.stores = {};
  this.currentDispatch = null;
  this.currentActionType = null;
  this.waitingToDispatch = [];
  this.dispatchInterceptor = defaultDispatchInterceptor;
  this._boundDispatch = this._dispatch.bind(this);

  for (var key in stores) {
    if (stores.hasOwnProperty(key)) {
      this.addStore(key, stores[key]);
    }
  }
};

Dispatcher.prototype.addStore = function(name, store) {
  store.dispatcher = this;
  this.stores[name] = store;
};

Dispatcher.prototype.dispatch = function(action) {
  this.dispatchInterceptor(action, this._boundDispatch);
};

Dispatcher.prototype._dispatch = function(action) {
  if (!action || !action.type) {
    throw new Error("Can only dispatch actions with a 'type' property");
  }

  if (this.currentDispatch) {
    var complaint = "Cannot dispatch an action ('" + action.type + "') while another action ('" +
                    this.currentActionType + "') is being dispatched";
    throw new Error(complaint);
  }

  this.waitingToDispatch = _.clone(this.stores);

  this.currentActionType = action.type;
  this.currentDispatch = _.mapValues(this.stores, function() {
    return { resolved: false, waitingOn: [], waitCallback: null };
  });

  try {
    this.doDispatchLoop(action);
  } finally {
    this.currentActionType = null;
    this.currentDispatch = null;
  }
};

Dispatcher.prototype.doDispatchLoop = function(action) {
  var dispatch, canBeDispatchedTo, wasHandled = false,
      removeFromDispatchQueue = [], dispatchedThisLoop = [];

  _.forOwn(this.waitingToDispatch, function(value, key) {
    dispatch = this.currentDispatch[key];
    canBeDispatchedTo = !dispatch.waitingOn.length ||
      !_.intersection(dispatch.waitingOn, _.keys(this.waitingToDispatch)).length;
    if (canBeDispatchedTo) {
      if (dispatch.waitCallback) {
        var stores = _.map(dispatch.waitingOn, function(key) {
          return this.stores[key];
        }.bind(this));
        var fn = dispatch.waitCallback;
        dispatch.waitCallback = null;
        dispatch.waitingOn = [];
        dispatch.resolved = true;
        fn.apply(null, stores);
        wasHandled = true;
      } else {
        dispatch.resolved = true;
        var handled = this.stores[key].__handleAction__(action);
        if (handled) {
          wasHandled = true;
        }
      }

      dispatchedThisLoop.push(key);

      if (this.currentDispatch[key].resolved) {
        removeFromDispatchQueue.push(key);
      }
    }
  }.bind(this));

  if (_.keys(this.waitingToDispatch).length && !dispatchedThisLoop.length) {
    var storesWithCircularWaits = _.keys(this.waitingToDispatch).join(", ");
    throw new Error("Indirect circular wait detected among: " + storesWithCircularWaits);
  }

  _.forEach(removeFromDispatchQueue, function(key) {
    delete this.waitingToDispatch[key];
  }.bind(this));

  if (_.size(this.waitingToDispatch)) {
    this.doDispatchLoop(action);
  }

  if (!wasHandled && console && console.warn) {
    console.warn("An action of type " + action.type + " was dispatched, but no store handled it");
  }

};

Dispatcher.prototype.waitForStores = function(store, stores, fn) {
  if (!this.currentDispatch) {
    throw new Error("Cannot wait unless an action is being dispatched");
  }

  var waitingStoreName = _.findKey(this.stores, function(val) {
    return val === store;
  });

  if (stores.indexOf(waitingStoreName) > -1) {
    throw new Error("A store cannot wait on itself");
  }

  var dispatch = this.currentDispatch[waitingStoreName];

  if (dispatch.waitingOn.length) {
    throw new Error(waitingStoreName + " already waiting on stores");
  }

  _.forEach(stores, function(storeName) {
    var storeDispatch = this.currentDispatch[storeName];
    if (!this.stores[storeName]) {
      throw new Error("Cannot wait for non-existent store " + storeName);
    }
    if (storeDispatch.waitingOn.indexOf(waitingStoreName) > -1) {
      throw new Error("Circular wait detected between " + waitingStoreName + " and " + storeName);
    }
  }.bind(this));

  dispatch.resolved = false;
  dispatch.waitingOn = _.uniq(dispatch.waitingOn.concat(stores));
  dispatch.waitCallback = fn;
};

Dispatcher.prototype.setDispatchInterceptor = function(fn) {
  if (fn) {
    this.dispatchInterceptor = fn;
  } else {
    this.dispatchInterceptor = defaultDispatchInterceptor;
  }
};

module.exports = Dispatcher;
